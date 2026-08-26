import { describe, it, expect, vi, beforeEach } from "vitest";
import { businessDayStartUtcMs } from "../lib/businessDay";

// Mock the Prisma client so NO real database is required. `getSummary` only
// calls `prisma.order.findMany`, so we implement a small in-memory version that
// honours the `createdAt` range filter the service passes in.
vi.mock("../lib/db", () => {
  return {
    default: {
      order: {
        findMany: vi.fn(),
      },
    },
  };
});

// Import AFTER the mock is declared (vi.mock is hoisted).
import prisma from "../lib/db";
import { getSummary } from "../lib/summary";

type SeedOrder = {
  status:
    | "PENDING"
    | "READY"
    | "COMPLETED"
    | "CANCELLED";
  isPaid: boolean;
  refunded: boolean;
  paymentMethod: "CASH" | "GCASH";
  totalPriceCents: number;
  createdAt: Date;
};

// Build a timestamp that falls safely inside the given Business_Day.
function withinDay(businessDay: string, hourOffset = 3): Date {
  return new Date(businessDayStartUtcMs(businessDay) + hourOffset * 3600_000);
}

// A small seeded set spanning the week of 2024-06-03 (Mon) .. 2024-06-09 (Sun).
const SEED_ORDERS: SeedOrder[] = [
  // 2024-06-05 (Wednesday): the "day view" anchor
  { status: "COMPLETED", isPaid: true, refunded: false, paymentMethod: "CASH", totalPriceCents: 10000, createdAt: withinDay("2024-06-05") },
  { status: "COMPLETED", isPaid: true, refunded: false, paymentMethod: "GCASH", totalPriceCents: 5000, createdAt: withinDay("2024-06-05") },
  // cancelled-unpaid -> counted but contributes ₱0 revenue
  { status: "CANCELLED", isPaid: false, refunded: false, paymentMethod: "CASH", totalPriceCents: 3000, createdAt: withinDay("2024-06-05") },
  // refunded -> excluded from revenue, reported in refundedCents
  { status: "CANCELLED", isPaid: true, refunded: true, paymentMethod: "GCASH", totalPriceCents: 2000, createdAt: withinDay("2024-06-05") },
  // 2024-06-04 (Tuesday)
  { status: "COMPLETED", isPaid: true, refunded: false, paymentMethod: "CASH", totalPriceCents: 7000, createdAt: withinDay("2024-06-04") },
  // 2024-06-03 (Monday) — a RECEIVED, not-yet-paid order still counts toward revenue
  { status: "RECEIVED", isPaid: false, refunded: false, paymentMethod: "CASH", totalPriceCents: 4000, createdAt: withinDay("2024-06-03") },
];

beforeEach(() => {
  const findMany = prisma.order.findMany as unknown as ReturnType<typeof vi.fn>;
  findMany.mockImplementation(async (args: any) => {
    const gte: Date = args.where.createdAt.gte;
    const lt: Date = args.where.createdAt.lt;
    return SEED_ORDERS.filter(
      (o) => o.createdAt.getTime() >= gte.getTime() && o.createdAt.getTime() < lt.getTime()
    );
  });
});

describe("Summary Service integration (mocked Prisma) — Requirements 9.3, 9.5, 9.8", () => {
  it("day view: excludes refunded + cancelled-unpaid and reconciles the breakdown", async () => {
    const s = await getSummary("day", "2024-06-05");

    expect(s.view).toBe("day");
    expect(s.startDate).toBe("2024-06-05");
    expect(s.endDate).toBe("2024-06-05");

    // 10000 (cash) + 5000 (gcash); 3000 cancelled-unpaid -> 0; 2000 refunded -> excluded
    expect(s.revenueCents).toBe(15000);
    expect(s.refundedCents).toBe(2000);
    expect(s.cashCents).toBe(10000);
    expect(s.gcashCents).toBe(5000);
    expect(s.cashCents + s.gcashCents).toBe(s.revenueCents);

    // Counts include cancelled orders.
    expect(s.totalOrders).toBe(4);
    expect(s.cancelledOrders).toBe(2);

    // Day breakdown has a single day and reconciles.
    expect(s.dailyBreakdown).toHaveLength(1);
    expect(s.dailyBreakdown[0]).toEqual({
      date: "2024-06-05",
      orders: 4,
      revenueCents: 15000,
    });
  });

  it("week view: aggregates the full Monday–Sunday range and reconciles", async () => {
    const s = await getSummary("week", "2024-06-05");

    expect(s.startDate).toBe("2024-06-03");
    expect(s.endDate).toBe("2024-06-09");
    expect(s.dailyBreakdown).toHaveLength(7);

    // 15000 (Wed) + 7000 (Tue) + 4000 (Mon)
    expect(s.revenueCents).toBe(26000);
    expect(s.refundedCents).toBe(2000);
    expect(s.totalOrders).toBe(6);
    expect(s.cancelledOrders).toBe(2);

    // Reconciliation: per-day sums equal the top-level totals.
    const dailyRevenue = s.dailyBreakdown.reduce((a, d) => a + d.revenueCents, 0);
    const dailyOrders = s.dailyBreakdown.reduce((a, d) => a + d.orders, 0);
    expect(dailyRevenue).toBe(s.revenueCents);
    expect(dailyOrders).toBe(s.totalOrders);
    expect(s.cashCents + s.gcashCents).toBe(s.revenueCents);
  });

  it("month view: spans the calendar month and reconciles", async () => {
    const s = await getSummary("month", "2024-06-05");

    expect(s.startDate).toBe("2024-06-01");
    expect(s.endDate).toBe("2024-06-30");
    expect(s.dailyBreakdown).toHaveLength(30);

    // All seeded orders fall in June.
    expect(s.revenueCents).toBe(26000);
    expect(s.refundedCents).toBe(2000);
    expect(s.totalOrders).toBe(6);
    expect(s.cancelledOrders).toBe(2);

    const dailyRevenue = s.dailyBreakdown.reduce((a, d) => a + d.revenueCents, 0);
    const dailyOrders = s.dailyBreakdown.reduce((a, d) => a + d.orders, 0);
    expect(dailyRevenue).toBe(s.revenueCents);
    expect(dailyOrders).toBe(s.totalOrders);
  });
});
