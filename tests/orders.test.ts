import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "../lib/types";

// --- Mock the Prisma client (lib/db) so NO real database is required. --------
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    menuItem: { findMany: vi.fn() },
    order: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderItem: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/db", () => ({ default: mockPrisma, prisma: mockPrisma }));

import { createOrder, updateOrder, OrderServiceError } from "../lib/orders";

// --- In-memory menu fixture --------------------------------------------------
// Espresso base 10000; Small +0, Large +3000; Extra shot 2500, Oat milk 1500.
// Latte base 12000 with no sizes/add-ons (used for mismatch cases).
const MENU = [
  {
    id: "item-espresso",
    name: "Espresso",
    category: "Coffee",
    basePriceCents: 10000,
    available: true,
    sizes: [
      { id: "size-small", menuItemId: "item-espresso", name: "Small", priceDeltaCents: 0 },
      { id: "size-large", menuItemId: "item-espresso", name: "Large", priceDeltaCents: 3000 },
    ],
    addOns: [
      { id: "addon-shot", menuItemId: "item-espresso", name: "Extra shot", priceCents: 2500, available: true },
      { id: "addon-oat", menuItemId: "item-espresso", name: "Oat milk", priceCents: 1500, available: true },
    ],
  },
  {
    id: "item-latte",
    name: "Latte",
    category: "Coffee",
    basePriceCents: 12000,
    available: true,
    sizes: [],
    addOns: [],
  },
];

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.menuItem.findMany.mockImplementation(async ({ where }: any) => {
    const ids: string[] = where.id.in;
    return MENU.filter((m) => ids.includes(m.id));
  });
  // 3 existing orders today → next dailyNumber should be 4.
  mockPrisma.order.count.mockResolvedValue(3);
  mockPrisma.order.create.mockImplementation(async (args: any) => ({
    id: "order-new",
    ...args.data,
  }));
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
});

describe("createOrder validation (HTTP 400 cases)", () => {
  it("rejects an empty items list", async () => {
    const err = await catchError(() =>
      createOrder({ paymentMethod: "CASH", items: [] })
    );
    expect(err).toBeInstanceOf(OrderServiceError);
    expect((err as OrderServiceError).statusCode).toBe(400);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects a quantity < 1", async () => {
    const err = await catchError(() =>
      createOrder({
        paymentMethod: "CASH",
        items: [{ menuItemId: "item-espresso", quantity: 0, addOnIds: [] }],
      })
    );
    expect(err).toBeInstanceOf(OrderServiceError);
    expect((err as OrderServiceError).statusCode).toBe(400);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown menuItemId", async () => {
    const err = await catchError(() =>
      createOrder({
        paymentMethod: "CASH",
        items: [{ menuItemId: "item-ghost", quantity: 1, addOnIds: [] }],
      })
    );
    expect(err).toBeInstanceOf(OrderServiceError);
    expect((err as OrderServiceError).statusCode).toBe(400);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects a sizeId that does not belong to the menuItem", async () => {
    // size-large belongs to Espresso, not Latte.
    const err = await catchError(() =>
      createOrder({
        paymentMethod: "CASH",
        items: [
          { menuItemId: "item-latte", sizeId: "size-large", quantity: 1, addOnIds: [] },
        ],
      })
    );
    expect(err).toBeInstanceOf(OrderServiceError);
    expect((err as OrderServiceError).statusCode).toBe(400);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });

  it("rejects an addOnId that does not belong to the menuItem", async () => {
    // addon-shot belongs to Espresso, not Latte.
    const err = await catchError(() =>
      createOrder({
        paymentMethod: "CASH",
        items: [
          { menuItemId: "item-latte", quantity: 1, addOnIds: ["addon-shot"] },
        ],
      })
    );
    expect(err).toBeInstanceOf(OrderServiceError);
    expect((err as OrderServiceError).statusCode).toBe(400);
    expect(mockPrisma.order.create).not.toHaveBeenCalled();
  });
});

describe("createOrder server authority", () => {
  it("ignores any client-supplied total and stores the server-computed total + dailyNumber", async () => {
    // Espresso Large + Extra shot, qty 2 → (10000 + 3000 + 2500) * 2 = 31000.
    await createOrder({
      paymentMethod: "CASH",
      // A malicious/incorrect client total that must be ignored:
      totalPriceCents: 1,
      total: 999999,
      items: [
        {
          menuItemId: "item-espresso",
          sizeId: "size-large",
          quantity: 2,
          addOnIds: ["addon-shot"],
        },
      ],
    } as any);

    expect(mockPrisma.order.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.order.create.mock.calls[0][0].data;
    expect(data.totalPriceCents).toBe(31000);
    expect(data.dailyNumber).toBe(4); // count(3) + 1
    expect(data.status).toBe(OrderStatus.PENDING);
    expect(data.isPaid).toBe(false);
    expect(data.refunded).toBe(false);
  });
});

describe("updateOrder items edit guard (HTTP 409)", () => {
  it("returns 409 for an items edit while the order is READY and changes nothing", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ status: OrderStatus.READY });

    const err = await catchError(() =>
      updateOrder("order-1", {
        kind: "items",
        items: [{ menuItemId: "item-espresso", quantity: 1, addOnIds: [] }],
      })
    );

    expect(err).toBeInstanceOf(OrderServiceError);
    expect((err as OrderServiceError).statusCode).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it("accepts an items edit while PENDING and recomputes the total", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ status: OrderStatus.PENDING });
    const tx = {
      orderItem: { deleteMany: vi.fn().mockResolvedValue({}) },
      order: {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ id: "order-1" }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await updateOrder("order-1", {
      kind: "items",
      // Espresso Large + Oat milk, qty 1 → 10000 + 3000 + 1500 = 14500.
      items: [
        {
          menuItemId: "item-espresso",
          sizeId: "size-large",
          quantity: 1,
          addOnIds: ["addon-oat"],
        },
      ],
    });

    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
    });
    const updateData = tx.order.update.mock.calls[0][0].data;
    expect(updateData.totalPriceCents).toBe(14500);
  });
});
