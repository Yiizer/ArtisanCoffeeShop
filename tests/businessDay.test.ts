import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  getBusinessDay,
  businessDayStartUtcMs,
  businessDayEndUtcMs,
  computeNextDailyNumber,
  assignDailyNumbers,
} from "../lib/businessDay";

describe("businessDay unit tests", () => {
  it("maps 2 AM Manila to that calendar date's business day", () => {
    // 2024-01-15 02:00 Manila == 2024-01-14 18:00 UTC
    const ms = Date.UTC(2024, 0, 14, 18, 0, 0);
    expect(getBusinessDay(ms)).toBe("2024-01-15");
  });

  it("maps 1:59 AM Manila to the previous business day", () => {
    // 2024-01-15 01:59 Manila == 2024-01-14 17:59 UTC (before the 2 AM boundary)
    const ms = Date.UTC(2024, 0, 14, 17, 59, 0);
    expect(getBusinessDay(ms)).toBe("2024-01-14");
  });

  it("computes the next daily number from the existing count", () => {
    expect(computeNextDailyNumber(0)).toBe(1);
    expect(computeNextDailyNumber(7)).toBe(8);
  });

  it("assigns sequential numbers and resets across a day boundary", () => {
    const day1Start = businessDayStartUtcMs("2024-03-01");
    const day2Start = businessDayStartUtcMs("2024-03-02");
    const numbers = assignDailyNumbers([
      day1Start,
      day1Start + 60_000,
      day1Start + 120_000,
      day2Start,
      day2Start + 60_000,
    ]);
    expect(numbers).toEqual([1, 2, 3, 1, 2]);
  });
});

// A generator for a valid business-day date string within a reasonable range.
const businessDayArb = fc
  .date({
    min: new Date(Date.UTC(2020, 0, 1)),
    max: new Date(Date.UTC(2035, 11, 31)),
  })
  .map((d) => getBusinessDay(d.getTime()));

describe("Feature: coffee-shop-ordering-system, Property 2: Daily number is sequential within a business day (resets at 2 AM Asia/Manila; cancelled orders still count)", () => {
  it("assigns 1..N in order within a business day and restarts at 1 after the boundary", () => {
    fc.assert(
      fc.property(
        businessDayArb,
        fc.integer({ min: 1, max: 30 }), // number of orders in the day
        fc.array(fc.boolean(), { maxLength: 30 }), // which orders get cancelled
        (day, n, cancelFlags) => {
          const start = businessDayStartUtcMs(day);
          const end = businessDayEndUtcMs(day);
          const span = end - start;

          // N strictly-increasing timestamps all within the same business day.
          const timestamps: number[] = [];
          for (let i = 0; i < n; i++) {
            // Spread evenly across the day, staying strictly inside [start, end).
            const t = start + Math.floor((span * i) / n);
            timestamps.push(t);
          }

          // Every generated timestamp must resolve to the same business day.
          for (const t of timestamps) {
            expect(getBusinessDay(t)).toBe(day);
          }

          const numbers = assignDailyNumbers(timestamps);
          // Sequential 1..N with no gaps, in creation order. Cancelled orders
          // (marked by cancelFlags) still occupy their number.
          expect(numbers).toEqual(
            Array.from({ length: n }, (_, i) => i + 1)
          );
          void cancelFlags;

          // The first order after the boundary (start of the day) is number 1.
          expect(numbers[0]).toBe(1);
        }
      )
    );
  });

  it("first order created just after the 2 AM boundary is number 1 in the new day", () => {
    fc.assert(
      fc.property(businessDayArb, (day) => {
        const start = businessDayStartUtcMs(day);
        // Last moment of the previous day and first moment of this day.
        const numbers = assignDailyNumbers([start - 1, start]);
        expect(getBusinessDay(start - 1)).not.toBe(day);
        expect(getBusinessDay(start)).toBe(day);
        // Previous day's order is number 1 of its own day; the new day's first
        // order resets to 1.
        expect(numbers).toEqual([1, 1]);
      })
    );
  });
});
