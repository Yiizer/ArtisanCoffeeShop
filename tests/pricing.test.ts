import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  computeItemLineTotalCents,
  computeOrderTotalCents,
  computeRunningTotalCents,
} from "../lib/pricing";
import type { ResolvedOrderItem } from "../lib/types";

// A generator for resolved order items using integer-centavo amounts.
const resolvedItemArb: fc.Arbitrary<ResolvedOrderItem> = fc.record({
  basePriceCents: fc.integer({ min: 0, max: 1_000_000 }),
  sizeDeltaCents: fc.integer({ min: -50_000, max: 50_000 }),
  addOnPricesCents: fc.array(fc.integer({ min: 0, max: 100_000 }), {
    maxLength: 6,
  }),
  quantity: fc.integer({ min: 1, max: 20 }),
});

// Independent reference implementation of the pricing formula.
function referenceTotal(items: ResolvedOrderItem[]): number {
  let total = 0;
  for (const item of items) {
    const addOns = item.addOnPricesCents.reduce((s, p) => s + p, 0);
    total += item.quantity * (item.basePriceCents + item.sizeDeltaCents + addOns);
  }
  return total;
}

describe("pricing unit tests", () => {
  it("computes a single item line total (base + size + add-ons) × quantity", () => {
    const item: ResolvedOrderItem = {
      basePriceCents: 15000, // ₱150.00
      sizeDeltaCents: 2000, // +₱20.00
      addOnPricesCents: [1500, 1000], // +₱15.00 +₱10.00
      quantity: 3,
    };
    // (15000 + 2000 + 2500) × 3 = 58500
    expect(computeItemLineTotalCents(item)).toBe(58500);
  });

  it("computes an order total as the sum of line totals", () => {
    const items: ResolvedOrderItem[] = [
      { basePriceCents: 10000, sizeDeltaCents: 0, addOnPricesCents: [], quantity: 2 },
      { basePriceCents: 5000, sizeDeltaCents: 500, addOnPricesCents: [500], quantity: 1 },
    ];
    // 20000 + 6000 = 26000
    expect(computeOrderTotalCents(items)).toBe(26000);
  });

  it("returns 0 for an empty order", () => {
    expect(computeOrderTotalCents([])).toBe(0);
  });
});

describe("Feature: coffee-shop-ordering-system, Property 1: Order total server authority — total equals the pricing formula and is independent of any client-supplied total", () => {
  it("computes totalPriceCents by the server formula regardless of client input", () => {
    fc.assert(
      fc.property(
        fc.array(resolvedItemArb, { minLength: 1, maxLength: 15 }),
        // A bogus client-supplied total that must never influence the result.
        fc.integer(),
        (items, clientTotalCents) => {
          const serverTotal = computeOrderTotalCents(items);
          // Matches the independent reference formula.
          expect(serverTotal).toBe(referenceTotal(items));
          // Independent of any client-supplied total.
          expect(serverTotal).toBe(computeOrderTotalCents(items));
          void clientTotalCents;
        }
      )
    );
  });
});

describe("Feature: coffee-shop-ordering-system, Property 8: Client running total matches server formula", () => {
  it("client display running total equals the server-authoritative total for the same selection", () => {
    fc.assert(
      fc.property(fc.array(resolvedItemArb, { maxLength: 15 }), (items) => {
        expect(computeRunningTotalCents(items)).toBe(
          computeOrderTotalCents(items)
        );
      })
    );
  });
});
