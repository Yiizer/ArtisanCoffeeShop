import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  aggregateSummary,
  contributesToRevenue,
  snapWeekRange,
  snapMonthRange,
} from "../lib/summaryLogic";
import type { SummaryOrderRecord } from "../lib/summaryLogic";
import { OrderStatus } from "../lib/types";

const statusArb = fc.constantFrom(
  OrderStatus.PENDING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED
);

const paymentArb = fc.constantFrom("CASH" as const, "GCASH" as const);

// Draw from a small set of business days so records actually group together.
const dayArb = fc.constantFrom(
  "2024-06-03",
  "2024-06-04",
  "2024-06-05",
  "2024-06-06"
);

const orderRecordArb: fc.Arbitrary<SummaryOrderRecord> = fc.record({
  businessDay: dayArb,
  status: statusArb,
  isPaid: fc.boolean(),
  refunded: fc.boolean(),
  paymentMethod: paymentArb,
  totalPriceCents: fc.integer({ min: 0, max: 500_000 }),
});

describe("summaryLogic unit tests", () => {
  it("excludes refunded and cancelled-unpaid orders from revenue", () => {
    const orders: SummaryOrderRecord[] = [
      { businessDay: "2024-06-03", status: OrderStatus.COMPLETED, isPaid: true, refunded: false, paymentMethod: "CASH", totalPriceCents: 10000 },
      { businessDay: "2024-06-03", status: OrderStatus.CANCELLED, isPaid: true, refunded: true, paymentMethod: "GCASH", totalPriceCents: 5000 },
      { businessDay: "2024-06-03", status: OrderStatus.CANCELLED, isPaid: false, refunded: false, paymentMethod: "CASH", totalPriceCents: 3000 },
    ];
    const summary = aggregateSummary(orders);
    expect(summary.revenueCents).toBe(10000);
    expect(summary.refundedCents).toBe(5000);
    expect(summary.totalOrders).toBe(3);
    expect(summary.cancelledOrders).toBe(2);
    expect(summary.cashCents).toBe(10000);
    expect(summary.gcashCents).toBe(0);
  });

  it("snaps a week range to Monday–Sunday", () => {
    // 2024-06-05 is a Wednesday.
    expect(snapWeekRange("2024-06-05")).toEqual({
      startDate: "2024-06-03", // Monday
      endDate: "2024-06-09", // Sunday
    });
  });

  it("snaps a month range to the calendar month", () => {
    expect(snapMonthRange("2024-02-15")).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29", // leap year
    });
  });
});

describe("Feature: coffee-shop-ordering-system, Property 5: Summary revenue exclusion and aggregation (reconciles per-day breakdown)", () => {
  it("computes revenue/refund exclusion and reconciles the daily breakdown", () => {
    fc.assert(
      fc.property(
        fc.array(orderRecordArb, { maxLength: 40 }),
        (orders) => {
          const summary = aggregateSummary(orders);

          // Reference revenue: orders neither refunded nor cancelled-unpaid.
          const expectedRevenue = orders
            .filter((o) => contributesToRevenue(o))
            .reduce((s, o) => s + o.totalPriceCents, 0);
          const expectedRefunded = orders
            .filter((o) => o.refunded)
            .reduce((s, o) => s + o.totalPriceCents, 0);

          expect(summary.revenueCents).toBe(expectedRevenue);
          expect(summary.refundedCents).toBe(expectedRefunded);

          // Counts include every order (cancelled included).
          expect(summary.totalOrders).toBe(orders.length);
          expect(summary.cancelledOrders).toBe(
            orders.filter((o) => o.status === OrderStatus.CANCELLED).length
          );

          // Reconciliation: per-day revenue and counts sum to the totals.
          const dailyRevenue = summary.dailyBreakdown.reduce(
            (s, d) => s + d.revenueCents,
            0
          );
          const dailyCount = summary.dailyBreakdown.reduce(
            (s, d) => s + d.orders,
            0
          );
          expect(dailyRevenue).toBe(summary.revenueCents);
          expect(dailyCount).toBe(summary.totalOrders);

          // Cash/GCash split reconciles with revenue.
          expect(summary.cashCents + summary.gcashCents).toBe(
            summary.revenueCents
          );

          // Daily breakdown is sorted ascending and has no duplicate dates.
          const dates = summary.dailyBreakdown.map((d) => d.date);
          expect(dates).toEqual([...dates].sort());
          expect(new Set(dates).size).toBe(dates.length);
        }
      )
    );
  });
});

// Any anchor date within a wide range.
const anchorArb = fc
  .date({
    min: new Date(Date.UTC(2020, 0, 1)),
    max: new Date(Date.UTC(2035, 11, 31)),
  })
  .map((d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("Feature: coffee-shop-ordering-system, Property 6: History range snapping (week Mon–Sun, month calendar)", () => {
  it("week range starts Monday, ends Sunday, spans 7 days and encloses the anchor", () => {
    fc.assert(
      fc.property(anchorArb, (anchor) => {
        const { startDate, endDate } = snapWeekRange(anchor);
        const start = toUtc(startDate);
        const end = toUtc(endDate);
        const anchorDate = toUtc(anchor);

        expect(start.getUTCDay()).toBe(1); // Monday
        expect(end.getUTCDay()).toBe(0); // Sunday
        expect((end.getTime() - start.getTime()) / DAY_MS).toBe(6);
        expect(anchorDate.getTime()).toBeGreaterThanOrEqual(start.getTime());
        expect(anchorDate.getTime()).toBeLessThanOrEqual(end.getTime());
      })
    );
  });

  it("month range spans the first through last day of the anchor's calendar month", () => {
    fc.assert(
      fc.property(anchorArb, (anchor) => {
        const { startDate, endDate } = snapMonthRange(anchor);
        const start = toUtc(startDate);
        const end = toUtc(endDate);
        const [ay, am] = anchor.split("-").map(Number);

        // Starts on the 1st of the anchor's month.
        expect(start.getUTCFullYear()).toBe(ay);
        expect(start.getUTCMonth() + 1).toBe(am);
        expect(start.getUTCDate()).toBe(1);

        // Ends on the last day of the same month (the next day rolls over).
        expect(end.getUTCFullYear()).toBe(ay);
        expect(end.getUTCMonth() + 1).toBe(am);
        const dayAfterEnd = new Date(end.getTime() + DAY_MS);
        expect(dayAfterEnd.getUTCDate()).toBe(1);
        expect(dayAfterEnd.getUTCMonth() + 1).toBe((am % 12) + 1);
      })
    );
  });
});
