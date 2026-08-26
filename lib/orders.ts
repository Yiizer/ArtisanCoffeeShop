// Order Service: create, read, update, and cancel orders.
//
// This service owns the *persistence + orchestration* around orders, but it
// deliberately delegates every piece of business arithmetic to the pure
// modules from Task 3:
//   - lib/pricing.ts       → authoritative totalPriceCents
//   - lib/businessDay.ts   → Business_Day boundary + dailyNumber
//   - lib/orderRules.ts    → PENDING-only edit guard + cancellation/refund
//
// The client never supplies a total; `totalPriceCents` is always recomputed
// here from menu data resolved out of the database.

import { Prisma } from "@prisma/client";
import prisma from "./db";
import { computeOrderTotalCents } from "./pricing";
import {
  getBusinessDay,
  businessDayStartUtcMs,
  businessDayEndUtcMs,
  computeNextDailyNumber,
} from "./businessDay";
import { applyItemsEdit, applyCancellation } from "./orderRules";
import { OrderStatus, PaymentMethod } from "./types";
import type {
  OrderStatus as OrderStatusType,
  PaymentMethod as PaymentMethodType,
  ResolvedOrderItem,
} from "./types";

// --- Input / patch shapes -------------------------------------------------

export type CreateOrderItemInput = {
  menuItemId: string;
  sizeId?: string | null;
  quantity: number;
  notes?: string | null;
  addOnIds?: string[];
};

export type CreateOrderInput = {
  customerName?: string | null;
  paymentMethod: PaymentMethodType;
  items: CreateOrderItemInput[];
};

export type OrderPatch =
  | { kind: "status"; status: OrderStatusType }
  | { kind: "payment"; isPaid: true; paymentRef?: string | null }
  | { kind: "items"; items: CreateOrderItemInput[] };

// --- Error type -----------------------------------------------------------

/**
 * Error carrying the HTTP status the route handler should surface. 400 for
 * validation failures, 409 for the RECEIVED-only edit guard, 404 for a missing
 * order.
 */
export class OrderServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "OrderServiceError";
  }
}

// --- Shared query shape ---------------------------------------------------

const orderInclude = {
  items: {
    include: {
      menuItem: true,
      size: true,
      addOns: { include: { addOn: true } },
    },
  },
} satisfies Prisma.OrderInclude;

// --- Internal helpers -----------------------------------------------------

type ResolvedLine = {
  resolved: ResolvedOrderItem;
  raw: {
    menuItemId: string;
    sizeId: string | null;
    quantity: number;
    notes: string | null;
    addOnIds: string[];
  };
};

/**
 * Resolve each submitted item against menu data and validate it. Throws an
 * OrderServiceError(400) for an empty list, a non-integer/`< 1` quantity, or an
 * unknown/mismatched `menuItemId`/`sizeId`/`addOnId`. Returns both the resolved
 * pricing shape and the raw shape needed for persistence.
 */
async function resolveAndValidateItems(
  items: CreateOrderItemInput[] | undefined
): Promise<ResolvedLine[]> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderServiceError(400, "Order must contain at least one item.");
  }

  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { sizes: true, addOns: true },
  });
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));

  const lines: ResolvedLine[] = [];
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new OrderServiceError(
        400,
        `Quantity must be an integer >= 1 (got ${item.quantity}).`
      );
    }

    const menuItem = menuMap.get(item.menuItemId);
    if (!menuItem) {
      throw new OrderServiceError(
        400,
        `Unknown menuItemId: ${item.menuItemId}.`
      );
    }

    let sizeDeltaCents = 0;
    const sizeId = item.sizeId ?? null;
    if (sizeId !== null) {
      const size = menuItem.sizes.find((s) => s.id === sizeId);
      if (!size) {
        throw new OrderServiceError(
          400,
          `Unknown or mismatched sizeId '${sizeId}' for menuItemId '${item.menuItemId}'.`
        );
      }
      sizeDeltaCents = size.priceDeltaCents;
    }

    const addOnIds = item.addOnIds ?? [];
    const addOnPricesCents: number[] = [];
    for (const addOnId of addOnIds) {
      const addOn = menuItem.addOns.find((a) => a.id === addOnId);
      if (!addOn) {
        throw new OrderServiceError(
          400,
          `Unknown or mismatched addOnId '${addOnId}' for menuItemId '${item.menuItemId}'.`
        );
      }
      addOnPricesCents.push(addOn.priceCents);
    }

    lines.push({
      resolved: {
        basePriceCents: menuItem.basePriceCents,
        sizeDeltaCents,
        addOnPricesCents,
        quantity: item.quantity,
      },
      raw: {
        menuItemId: item.menuItemId,
        sizeId,
        quantity: item.quantity,
        notes: item.notes ?? null,
        addOnIds,
      },
    });
  }

  return lines;
}

/** Build a nested Prisma create payload for a single resolved order line. */
function buildItemCreate(
  raw: ResolvedLine["raw"]
): Prisma.OrderItemCreateWithoutOrderInput {
  return {
    menuItem: { connect: { id: raw.menuItemId } },
    ...(raw.sizeId ? { size: { connect: { id: raw.sizeId } } } : {}),
    quantity: raw.quantity,
    notes: raw.notes,
    addOns: {
      create: raw.addOnIds.map((addOnId) => ({
        addOn: { connect: { id: addOnId } },
      })),
    },
  };
}

function assertValidPaymentMethod(
  value: unknown
): asserts value is PaymentMethodType {
  if (value !== PaymentMethod.CASH && value !== PaymentMethod.GCASH) {
    throw new OrderServiceError(
      400,
      `paymentMethod must be one of CASH or GCASH (got ${String(value)}).`
    );
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Create an order. Resolves and validates items, computes the authoritative
 * `totalPriceCents` via lib/pricing, assigns the next `dailyNumber` for the
 * current Business_Day, and stores the order with status PENDING. Any
 * client-supplied total on the payload is ignored.
 */
export async function createOrder(input: CreateOrderInput) {
  if (input == null || typeof input !== "object") {
    throw new OrderServiceError(400, "Missing order payload.");
  }
  assertValidPaymentMethod(input.paymentMethod);

  const lines = await resolveAndValidateItems(input.items);
  const totalPriceCents = computeOrderTotalCents(lines.map((l) => l.resolved));

  const now = new Date();
  const businessDay = getBusinessDay(now);
  const existingInDay = await prisma.order.count({
    where: {
      createdAt: {
        gte: new Date(businessDayStartUtcMs(businessDay)),
        lt: new Date(businessDayEndUtcMs(businessDay)),
      },
    },
  });
  const dailyNumber = computeNextDailyNumber(existingInDay);

  return prisma.order.create({
    data: {
      dailyNumber,
      customerName: input.customerName ?? null,
      status: OrderStatus.PENDING,
      paymentMethod: input.paymentMethod,
      isPaid: false,
      refunded: false,
      totalPriceCents,
      items: { create: lines.map((l) => buildItemCreate(l.raw)) },
    },
    include: orderInclude,
  });
}

/**
 * List orders for a Business_Day. `date` (a `YYYY-MM-DD` Business_Day key)
 * defaults to the current Business_Day (2 AM Asia/Manila), which is what the
 * live queue polls. Returns orders (including COMPLETED and CANCELLED) with
 * their items, sizes, and add-ons, oldest first.
 */
export async function listOrders(date?: string) {
  const businessDay = date ?? getBusinessDay(new Date());
  return prisma.order.findMany({
    where: {
      createdAt: {
        gte: new Date(businessDayStartUtcMs(businessDay)),
        lt: new Date(businessDayEndUtcMs(businessDay)),
      },
    },
    orderBy: { dailyNumber: "asc" },
    include: orderInclude,
  });
}

/**
 * Update an order. Supports three patch kinds:
 *   - status:  advance the Order_Status.
 *   - payment: mark the order paid, storing an optional GCash paymentRef.
 *   - items:   edit items — re-reads the current stored status and applies the
 *              PENDING-only guard from lib/orderRules; rejected edits raise a
 *              409 and change nothing, accepted edits recompute totalPriceCents.
 */
export async function updateOrder(id: string, patch: OrderPatch) {
  switch (patch.kind) {
    case "status": {
      const status = patch.status;
      const allowed = Object.values(OrderStatus) as OrderStatusType[];
      if (!allowed.includes(status)) {
        throw new OrderServiceError(400, `Unknown status: ${String(status)}.`);
      }
      await ensureOrderExists(id);
      return prisma.order.update({
        where: { id },
        data: { status },
        include: orderInclude,
      });
    }

    case "payment": {
      await ensureOrderExists(id);
      return prisma.order.update({
        where: { id },
        data: { isPaid: true, paymentRef: patch.paymentRef ?? null },
        include: orderInclude,
      });
    }

    case "items": {
      // Re-read the current stored status (Requirement 6.4) before deciding.
      const current = await prisma.order.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!current) {
        throw new OrderServiceError(404, `Order not found: ${id}.`);
      }

      const lines = await resolveAndValidateItems(patch.items);
      const guard = applyItemsEdit(
        current.status as OrderStatusType,
        lines.map((l) => l.resolved)
      );
      if (!guard.accepted) {
        throw new OrderServiceError(
          guard.httpStatus,
          "Items can only be edited while the order status is PENDING."
        );
      }

      return prisma.$transaction(async (tx) => {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.order.update({
          where: { id },
          data: {
            totalPriceCents: guard.totalPriceCents,
            items: { create: lines.map((l) => buildItemCreate(l.raw)) },
          },
        });
        return tx.order.findUnique({ where: { id }, include: orderInclude });
      });
    }

    default: {
      // Exhaustiveness guard.
      const _never: never = patch;
      throw new OrderServiceError(400, "Unsupported order patch.");
    }
  }
}

/**
 * Cancel an order. Applies the pure cancellation/refund rule: status becomes
 * CANCELLED and `refunded` is set true iff the order was paid. The order stays
 * counted in daily numbering and remains queryable for the Business_Day.
 */
export async function cancelOrder(id: string) {
  const current = await prisma.order.findUnique({
    where: { id },
    select: { isPaid: true },
  });
  if (!current) {
    throw new OrderServiceError(404, `Order not found: ${id}.`);
  }

  const { status, refunded } = applyCancellation(current.isPaid);
  return prisma.order.update({
    where: { id },
    data: { status, refunded },
    include: orderInclude,
  });
}

async function ensureOrderExists(id: string): Promise<void> {
  const found = await prisma.order.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) {
    throw new OrderServiceError(404, `Order not found: ${id}.`);
  }
}
