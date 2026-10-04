// Order Service: create, read, update, and cancel orders.
//
// Extended for Inventory, Costing & Profit:
// - Native upsert on DailyCounter + outer retry on P2002 / P2034
// - Version compare-and-set concurrency guard on all order mutations
// - Ascending ingredientId locking for deadlock-safe stock updates
// - Ledger updates: SALE, RETURN, WASTE with reversesId backstop
// - Line total and cost snapshots (costCents, uncostedLines)
// - Attribution tracking (createdById, cancelledById)

import { Prisma } from "@prisma/client";
import prisma from "./db";
import { computeOrderTotalCents } from "./pricing";
import {
  getBusinessDay,
  businessDayStartUtcMs,
  businessDayEndUtcMs,
} from "./businessDay";
import { applyItemsEdit, applyCancellation } from "./orderRules";
import { OrderStatus, PaymentMethod } from "./types";
import type {
  OrderStatus as OrderStatusType,
  PaymentMethod as PaymentMethodType,
  ResolvedOrderItem,
} from "./types";
import {
  computeItemUnitRequirements,
  computeLineCostCents,
  computeOrderCost,
  type MenuItemCostInput,
} from "./costing";
import { toDec, toPrismaDec } from "./decimal";
import { Decimal } from "decimal.js";

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
  isPaid?: boolean;
  totalPriceCents?: number;
  total?: number;
  createdById?: string | null;
};

export type OrderPatch =
  | { kind: "status"; status: OrderStatusType }
  | { kind: "payment"; isPaid: true; paymentRef?: string | null }
  | { kind: "items"; items: CreateOrderItemInput[] };

export type CancelOrderOptions = {
  wasMade?: boolean;
  cancelledById?: string | null;
};

// --- Error type -----------------------------------------------------------

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
  stockMovements: {
    where: { reason: "SALE", reversedBy: null },
    select: { id: true },
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
  lineTotalCents: number;
  costCents: number | null;
  unitRequirements: Map<string, Decimal>;
};

async function resolveAndValidateItems(
  items: CreateOrderItemInput[] | undefined,
  txClient: Prisma.TransactionClient | typeof prisma = prisma
): Promise<{
  lines: ResolvedLine[];
  netRequirements: Map<string, Decimal>;
  orderCost: { costCents: number | null; uncostedLines: number };
}> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderServiceError(400, "Order must contain at least one item.");
  }

  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
  const menuItems = await txClient.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: {
      sizes: { include: { ingredients: true } },
      addOns: { include: { ingredients: true } },
      ingredients: true,
    },
  });
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));

  // Collect all ingredient IDs across all involved menu items to load their costs
  const allIngredientIds = new Set<string>();
  for (const m of menuItems) {
    m.ingredients?.forEach((ing) => allIngredientIds.add(ing.ingredientId));
    m.sizes?.forEach((s) => s.ingredients?.forEach((ing) => allIngredientIds.add(ing.ingredientId)));
    m.addOns?.forEach((a) => a.ingredients?.forEach((ing) => allIngredientIds.add(ing.ingredientId)));
  }

  const ingredientRecords = allIngredientIds.size > 0
    ? await txClient.ingredient.findMany({
        where: { id: { in: Array.from(allIngredientIds) } },
        select: { id: true, unitCostCents: true },
      })
    : [];

  const ingredientCostMap = new Map<string, Decimal | null>();
  for (const ing of ingredientRecords) {
    ingredientCostMap.set(ing.id, ing.unitCostCents ? toDec(ing.unitCostCents) : null);
  }

  const lines: ResolvedLine[] = [];
  const netRequirements = new Map<string, Decimal>();

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

    const resolved: ResolvedOrderItem = {
      basePriceCents: menuItem.basePriceCents,
      sizeDeltaCents,
      addOnPricesCents,
      quantity: item.quantity,
    };

    const unitPriceCents = menuItem.basePriceCents + sizeDeltaCents + addOnPricesCents.reduce((s, p) => s + p, 0);
    const lineTotalCents = unitPriceCents * item.quantity;

    // Costing calculation
    const costInput: MenuItemCostInput = {
      id: menuItem.id,
      name: menuItem.name,
      basePriceCents: menuItem.basePriceCents,
      noIngredients: menuItem.noIngredients,
      ingredients: (menuItem.ingredients ?? []).map((i) => ({ ingredientId: i.ingredientId, qty: i.qty })),
      sizes: (menuItem.sizes ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        priceDeltaCents: s.priceDeltaCents,
        ingredients: (s.ingredients ?? []).map((si) => ({ ingredientId: si.ingredientId, qtyDelta: si.qtyDelta })),
      })),
      addOns: (menuItem.addOns ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        priceCents: a.priceCents,
        noIngredients: a.noIngredients,
        ingredients: (a.ingredients ?? []).map((ai) => ({ ingredientId: ai.ingredientId, qty: ai.qty })),
      })),
    };

    const costCents = computeLineCostCents(costInput, sizeId, addOnIds, item.quantity, ingredientCostMap);
    const unitReqs = computeItemUnitRequirements(costInput, sizeId, addOnIds);

    // Accumulate total required stock
    for (const [ingId, qtyPerUnit] of unitReqs.entries()) {
      if (qtyPerUnit.isZero()) continue;
      const totalIngQty = qtyPerUnit.times(item.quantity);
      const curr = netRequirements.get(ingId) ?? new Decimal(0);
      netRequirements.set(ingId, curr.plus(totalIngQty));
    }

    lines.push({
      resolved,
      raw: {
        menuItemId: item.menuItemId,
        sizeId,
        quantity: item.quantity,
        notes: item.notes ?? null,
        addOnIds,
      },
      lineTotalCents,
      costCents,
      unitRequirements: unitReqs,
    });
  }

  const orderCost = computeOrderCost(lines.map((l) => l.costCents));

  return { lines, netRequirements, orderCost };
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
 * Create an order.
 * - Native upsert on DailyCounter lazily initialized from max(dailyNumber)
 * - Atomic stock deduction in sorted ingredientId order
 * - SALE rows inserted for all consumed ingredients
 * - Outer retry loop on P2002 / P2034
 */
export async function createOrder(input: CreateOrderInput) {
  if (input == null || typeof input !== "object") {
    throw new OrderServiceError(400, "Missing order payload.");
  }
  assertValidPaymentMethod(input.paymentMethod);

  const now = new Date();
  const businessDay = getBusinessDay(now);
  const dayStart = new Date(businessDayStartUtcMs(businessDay));
  const dayEnd = new Date(businessDayEndUtcMs(businessDay));

  let retries = 1;
  while (true) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { lines, netRequirements, orderCost } = await resolveAndValidateItems(input.items, tx);
        const totalPriceCents = computeOrderTotalCents(lines.map((l) => l.resolved));

        // 1. DailyCounter upsert (native ON CONFLICT)
        const prevMax = await tx.order.aggregate({
          where: { createdAt: { gte: dayStart, lt: dayEnd } },
          _max: { dailyNumber: true },
        });

        const { lastNumber } = await tx.dailyCounter.upsert({
          where: { businessDay },
          create: { businessDay, lastNumber: (prevMax._max.dailyNumber ?? 0) + 1 },
          update: { lastNumber: { increment: 1 } },
        });

        // 2. Deduct stock in ascending ingredientId order (deadlock avoidance)
        const sortedIngredientIds = Array.from(netRequirements.keys()).sort();
        for (const ingId of sortedIngredientIds) {
          const reqQty = netRequirements.get(ingId)!;
          if (!reqQty.isZero()) {
            await tx.ingredient.update({
              where: { id: ingId },
              data: {
                stockQty: { decrement: toPrismaDec(reqQty) },
              },
            });
          }
        }

        // 3. Create the order
        const createdOrder = await tx.order.create({
          data: {
            businessDay,
            dailyNumber: lastNumber,
            customerName: input.customerName ?? null,
            status: OrderStatus.PENDING,
            paymentMethod: input.paymentMethod,
            isPaid: !!input.isPaid,
            refunded: false,
            totalPriceCents,
            costCents: orderCost.costCents,
            uncostedLines: orderCost.uncostedLines,
            createdById: input.createdById ?? null,
            items: {
              create: lines.map((l) => ({
                menuItem: { connect: { id: l.raw.menuItemId } },
                ...(l.raw.sizeId ? { size: { connect: { id: l.raw.sizeId } } } : {}),
                quantity: l.raw.quantity,
                notes: l.raw.notes,
                lineTotalCents: l.lineTotalCents,
                costCents: l.costCents,
                addOns: {
                  create: l.raw.addOnIds.map((addOnId) => ({
                    addOn: { connect: { id: addOnId } },
                  })),
                },
              })),
            },
          },
          include: orderInclude,
        });

        // 4. Create SALE rows in StockMovement
        for (const ingId of sortedIngredientIds) {
          const reqQty = netRequirements.get(ingId)!;
          if (!reqQty.isZero()) {
            const ingRecord = await tx.ingredient.findUnique({
              where: { id: ingId },
              select: { unitCostCents: true },
            });
            await tx.stockMovement.create({
              data: {
                ingredientId: ingId,
                qtyChange: toPrismaDec(reqQty.negated()),
                unitCostCents: ingRecord?.unitCostCents ?? null,
                reason: "SALE",
                orderId: createdOrder.id,
                createdById: input.createdById ?? null,
              },
            });
          }
        }

        const res = createdOrder as any;
        res.hasStockUsage = createdOrder.stockMovements && createdOrder.stockMovements.length > 0;
        return res;
      });
    } catch (err: any) {
      if ((err?.code === "P2002" || err?.code === "P2034") && retries > 0) {
        retries--;
        continue;
      }
      if (err?.code === "P2002" || err?.code === "P2034") {
        throw new OrderServiceError(409, "Conflict while creating order. Please retry.");
      }
      throw err;
    }
  }
}

/**
 * List orders for a Business_Day.
 */
export async function listOrders(date?: string) {
  const businessDay = date ?? getBusinessDay(new Date());
  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: new Date(businessDayStartUtcMs(businessDay)),
        lt: new Date(businessDayEndUtcMs(businessDay)),
      },
    },
    orderBy: { dailyNumber: "asc" },
    include: orderInclude,
  });

  return orders.map((o) => {
    const res = o as any;
    res.hasStockUsage = o.stockMovements && o.stockMovements.length > 0;
    return res;
  });
}

/**
 * Update an order:
 * - status: guarded compare-and-set on version, rejects target CANCELLED (use DELETE), rejects from CANCELLED.
 * - payment: guarded compare-and-set on version.
 * - items: guarded compare-and-set on version, returns old non-reversed SALEs, creates new SALEs, net stock update.
 */
export async function updateOrder(id: string, patch: OrderPatch, actingUserId?: string | null) {
  switch (patch.kind) {
    case "status": {
      const status = patch.status;
      const allowed = Object.values(OrderStatus) as OrderStatusType[];
      if (!allowed.includes(status)) {
        throw new OrderServiceError(400, `Unknown status: ${String(status)}.`);
      }
      if (status === OrderStatus.CANCELLED) {
        throw new OrderServiceError(
          400,
          "Cannot set status to CANCELLED via PATCH. Use DELETE /api/orders/[id] to cancel orders."
        );
      }

      return prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({
          where: { id },
          select: { id: true, status: true, version: true },
        });
        if (!current) {
          throw new OrderServiceError(404, `Order not found: ${id}.`);
        }
        if (current.status === OrderStatus.CANCELLED) {
          throw new OrderServiceError(409, "Cannot modify a cancelled order.");
        }

        const updateResult = await tx.order.updateMany({
          where: { id, version: current.version },
          data: {
            status,
            version: { increment: 1 },
          },
        });
        if (updateResult.count !== 1) {
          throw new OrderServiceError(409, "Order changed, please refresh.");
        }

        const updated = await tx.order.findUnique({
          where: { id },
          include: orderInclude,
        });
        const res = updated as any;
        res.hasStockUsage = updated?.stockMovements && updated.stockMovements.length > 0;
        return res;
      });
    }

    case "payment": {
      return prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({
          where: { id },
          select: { id: true, status: true, version: true },
        });
        if (!current) {
          throw new OrderServiceError(404, `Order not found: ${id}.`);
        }

        const updateResult = await tx.order.updateMany({
          where: { id, version: current.version },
          data: {
            isPaid: true,
            paymentRef: patch.paymentRef ?? null,
            version: { increment: 1 },
          },
        });
        if (updateResult.count !== 1) {
          throw new OrderServiceError(409, "Order changed, please refresh.");
        }

        const updated = await tx.order.findUnique({
          where: { id },
          include: orderInclude,
        });
        const res = updated as any;
        res.hasStockUsage = updated?.stockMovements && updated.stockMovements.length > 0;
        return res;
      });
    }

    case "items": {
      const initial = await prisma.order.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!initial) {
        throw new OrderServiceError(404, `Order not found: ${id}.`);
      }
      const guard = applyItemsEdit(initial.status as OrderStatusType, []);
      if (!guard.accepted) {
        throw new OrderServiceError(
          guard.httpStatus,
          "Items can only be edited while the order status is PENDING."
        );
      }

      return prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({
          where: { id },
          select: { id: true, status: true, version: true },
        });
        if (!current) {
          throw new OrderServiceError(404, `Order not found: ${id}.`);
        }
        if (current.status !== OrderStatus.PENDING) {
          throw new OrderServiceError(
            409,
            "Items can only be edited while the order status is PENDING."
          );
        }

        const { lines, netRequirements, orderCost } = await resolveAndValidateItems(patch.items, tx);
        const totalPriceCents = computeOrderTotalCents(lines.map((l) => l.resolved));

        // 1. Guarded write FIRST taking the row lock
        const updateResult = await tx.order.updateMany({
          where: { id, version: current.version },
          data: {
            totalPriceCents,
            costCents: orderCost.costCents,
            uncostedLines: orderCost.uncostedLines,
            version: { increment: 1 },
          },
        });
        if (updateResult.count !== 1) {
          throw new OrderServiceError(409, "Order changed, please refresh.");
        }

        // 2. Read non-reversed SALE rows
        const sales = await tx.stockMovement.findMany({
          where: { orderId: id, reason: "SALE", reversedBy: null },
        });

        // 3. Return previous sales
        const returnedMap = new Map<string, Decimal>();
        for (const sale of sales) {
          const retQty = toDec(sale.qtyChange).negated(); // positive
          await tx.stockMovement.create({
            data: {
              ingredientId: sale.ingredientId,
              qtyChange: toPrismaDec(retQty),
              unitCostCents: sale.unitCostCents,
              reason: "RETURN",
              orderId: id,
              reversesId: sale.id,
              createdById: actingUserId ?? null,
            },
          });
          const curr = returnedMap.get(sale.ingredientId) ?? new Decimal(0);
          returnedMap.set(sale.ingredientId, curr.plus(retQty));
        }

        // 4. Create new SALE rows
        const newIngredientIds = Array.from(netRequirements.keys());
        for (const ingId of newIngredientIds) {
          const reqQty = netRequirements.get(ingId)!;
          if (!reqQty.isZero()) {
            const ingRecord = await tx.ingredient.findUnique({
              where: { id: ingId },
              select: { unitCostCents: true },
            });
            await tx.stockMovement.create({
              data: {
                ingredientId: ingId,
                qtyChange: toPrismaDec(reqQty.negated()),
                unitCostCents: ingRecord?.unitCostCents ?? null,
                reason: "SALE",
                orderId: id,
                createdById: actingUserId ?? null,
              },
            });
          }
        }

        // 5. Net stock delta per ingredient in ascending ingredientId order
        const allInvolvedIds = Array.from(new Set([...returnedMap.keys(), ...netRequirements.keys()])).sort();
        for (const ingId of allInvolvedIds) {
          const returned = returnedMap.get(ingId) ?? new Decimal(0);
          const newlyNeeded = netRequirements.get(ingId) ?? new Decimal(0);
          const netStockDelta = returned.minus(newlyNeeded); // positive = net stock returned; negative = net stock deducted
          if (!netStockDelta.isZero()) {
            await tx.ingredient.update({
              where: { id: ingId },
              data: {
                stockQty: { increment: toPrismaDec(netStockDelta) },
              },
            });
          }
        }

        // 6. Delete old items and create new items
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.order.update({
          where: { id },
          data: {
            totalPriceCents,
            items: {
              create: lines.map((l) => ({
                menuItem: { connect: { id: l.raw.menuItemId } },
                ...(l.raw.sizeId ? { size: { connect: { id: l.raw.sizeId } } } : {}),
                quantity: l.raw.quantity,
                notes: l.raw.notes,
                lineTotalCents: l.lineTotalCents,
                costCents: l.costCents,
                addOns: {
                  create: l.raw.addOnIds.map((addOnId) => ({
                    addOn: { connect: { id: addOnId } },
                  })),
                },
              })),
            },
          },
        });

        const updated = await tx.order.findUnique({
          where: { id },
          include: orderInclude,
        });
        const res = updated as any;
        res.hasStockUsage = updated?.stockMovements && updated.stockMovements.length > 0;
        return res;
      });
    }

    default: {
      const _never: never = patch;
      throw new OrderServiceError(400, "Unsupported order patch.");
    }
  }
}

/**
 * Cancel an order:
 * - Requires wasMade (boolean) if status is READY/COMPLETED and order has stock movements
 * - Guarded compare-and-set on version
 * - RETURN / WASTE ledger pairs
 */
export async function cancelOrder(id: string, options?: CancelOrderOptions) {
  return prisma.$transaction(async (tx) => {
    // 1. Read
    const current = await tx.order.findUnique({
      where: { id },
      select: { id: true, status: true, version: true, isPaid: true },
    });
    if (!current) {
      throw new OrderServiceError(404, `Order not found: ${id}.`);
    }
    if (current.status === OrderStatus.CANCELLED) {
      throw new OrderServiceError(409, "Order is already cancelled.");
    }

    // 2. Read non-reversed SALE rows
    const sales = await tx.stockMovement.findMany({
      where: { orderId: id, reason: "SALE", reversedBy: null },
    });
    const hasSaleRows = sales.length > 0;

    // 3. wasMade validation
    const isReadyOrCompleted = current.status === OrderStatus.READY || current.status === OrderStatus.COMPLETED;
    if (isReadyOrCompleted && hasSaleRows) {
      if (options?.wasMade === undefined || options?.wasMade === null) {
        throw new OrderServiceError(
          400,
          "wasMade parameter is required when cancelling a READY or COMPLETED order with stock usage."
        );
      }
    }

    const { status, refunded } = applyCancellation(current.isPaid);

    // 4. Guarded write FIRST
    const updateResult = await tx.order.updateMany({
      where: { id, version: current.version },
      data: {
        status,
        refunded,
        cancelledById: options?.cancelledById ?? null,
        cancelledAt: new Date(),
        cancelWasMade: options?.wasMade ?? null,
        version: { increment: 1 },
      },
    });
    if (updateResult.count !== 1) {
      throw new OrderServiceError(409, "Order changed, please refresh.");
    }

    // 5. Ledger actions
    if (hasSaleRows) {
      const drinkWasMade = isReadyOrCompleted && !!options?.wasMade;
      if (!drinkWasMade) {
        // Stock is returned
        const restoreMap = new Map<string, Decimal>();
        for (const sale of sales) {
          const retQty = toDec(sale.qtyChange).negated();
          await tx.stockMovement.create({
            data: {
              ingredientId: sale.ingredientId,
              qtyChange: toPrismaDec(retQty),
              unitCostCents: sale.unitCostCents,
              reason: "RETURN",
              orderId: id,
              reversesId: sale.id,
              createdById: options?.cancelledById ?? null,
            },
          });
          const curr = restoreMap.get(sale.ingredientId) ?? new Decimal(0);
          restoreMap.set(sale.ingredientId, curr.plus(retQty));
        }

        const sortedIds = Array.from(restoreMap.keys()).sort();
        for (const ingId of sortedIds) {
          await tx.ingredient.update({
            where: { id: ingId },
            data: {
              stockQty: { increment: toPrismaDec(restoreMap.get(ingId)!) },
            },
          });
        }
      } else {
        // Drink WAS made: stock remains deducted (net 0), record RETURN + WASTE pair per SALE
        for (const sale of sales) {
          const retQty = toDec(sale.qtyChange).negated();
          await tx.stockMovement.create({
            data: {
              ingredientId: sale.ingredientId,
              qtyChange: toPrismaDec(retQty),
              unitCostCents: sale.unitCostCents,
              reason: "RETURN",
              orderId: id,
              reversesId: sale.id,
              createdById: options?.cancelledById ?? null,
            },
          });
          await tx.stockMovement.create({
            data: {
              ingredientId: sale.ingredientId,
              qtyChange: sale.qtyChange, // negative
              unitCostCents: sale.unitCostCents,
              reason: "WASTE",
              orderId: id,
              note: `Cancelled order ${id} (drink was made)`,
              createdById: options?.cancelledById ?? null,
            },
          });
        }
      }
    }

    const updated = await tx.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    const res = updated as any;
    res.hasStockUsage = false;
    return res;
  });
}
