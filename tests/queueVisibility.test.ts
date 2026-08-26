import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { OrderStatus } from "../lib/types";
import {
  getBusinessDay,
  businessDayStartUtcMs,
  businessDayEndUtcMs,
} from "../lib/businessDay";

// --- Mock the Prisma client (lib/db) so NO real database is required. --------
// The mock implements a faithful `findMany` that filters by the createdAt
// window it is given and, crucially, does NOT filter by status — mirroring a
// day-scoped query. This lets the property assert that listOrders() returns
// every current-Business_Day order regardless of status (including COMPLETED
// and CANCELLED).
const { mockPrisma, fixture } = vi.hoisted(() => ({
  mockPrisma: { order: { findMany: vi.fn() } },
  fixture: { orders: [] as any[] },
}));

vi.mock("../lib/db", () => ({ default: mockPrisma, prisma: mockPrisma }));

import { listOrders } from "../lib/orders";

const STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  // Faithful day-scoped query: filter only by the createdAt window; keep every
  // status; order by dailyNumber ascending (matching the real query's orderBy).
  mockPrisma.order.findMany.mockImplementation(async ({ where }: any) => {
    const gte = where.createdAt.gte.getTime();
    const lt = where.createdAt.lt.getTime();
    return fixture.orders
      .filter((o) => {
        const t = o.createdAt.getTime();
        return t >= gte && t < lt;
      })
      .sort((a, b) => a.dailyNumber - b.dailyNumber);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Feature: coffee-shop-ordering-system, Property 9: Day-scoped queue visibility (undated query returns all current-day orders incl. COMPLETED/CANCELLED)", () => {
  it("returns exactly the current Business_Day orders across all statuses", async () => {
    // Pin the clock so getBusinessDay(new Date()) is deterministic and safely
    // inside a business day (mid-morning Manila, far from the 2 AM boundary).
    const FIXED_NOW = Date.UTC(2024, 5, 15, 6, 0, 0); // 14:00 Manila
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const today = getBusinessDay(new Date(FIXED_NOW));
    const start = businessDayStartUtcMs(today);
    const end = businessDayEndUtcMs(today);

    const specArb = fc.record({
      status: fc.constantFrom(...STATUSES),
      // Where the order sits relative to the current Business_Day window.
      loc: fc.constantFrom("in" as const, "before" as const, "after" as const),
      // Offset (ms) into that window; bounded to stay well within a single day.
      offset: fc.integer({ min: 1, max: DAY_MS - 2 }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(specArb, { minLength: 1, maxLength: 30 }),
        async (specs) => {
          const orders = specs.map((s, i) => {
            let createdAt: Date;
            if (s.loc === "in") createdAt = new Date(start + s.offset);
            else if (s.loc === "before")
              createdAt = new Date(start - s.offset); // previous day
            else createdAt = new Date(end + s.offset); // next day
            return {
              id: `order-${i}`,
              dailyNumber: i + 1,
              status: s.status,
              createdAt,
            };
          });
          fixture.orders = orders;

          // Expected: every order whose createdAt is inside the current day,
          // regardless of status.
          const expectedIds = orders
            .filter((o) => {
              const t = o.createdAt.getTime();
              return t >= start && t < end;
            })
            .map((o) => o.id)
            .sort();

          const result = await listOrders(); // undated → current Business_Day
          const resultIds = result.map((o: any) => o.id).sort();

          // 1) The result is exactly the current-day set (no leakage across days).
          expect(resultIds).toEqual(expectedIds);

          // 2) COMPLETED and CANCELLED current-day orders are NOT filtered out.
          const terminalInDayIds = orders
            .filter((o) => {
              const t = o.createdAt.getTime();
              const inDay = t >= start && t < end;
              return (
                inDay &&
                (o.status === OrderStatus.COMPLETED ||
                  o.status === OrderStatus.CANCELLED)
              );
            })
            .map((o) => o.id);
          for (const id of terminalInDayIds) {
            expect(resultIds).toContain(id);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
