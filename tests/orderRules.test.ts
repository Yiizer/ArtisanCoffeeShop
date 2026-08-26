import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyItemsEdit, applyCancellation } from "../lib/orderRules";
import { computeOrderTotalCents } from "../lib/pricing";
import { OrderStatus } from "../lib/types";
import type { OrderStatus as OrderStatusType, ResolvedOrderItem } from "../lib/types";

const resolvedItemArb: fc.Arbitrary<ResolvedOrderItem> = fc.record({
  basePriceCents: fc.integer({ min: 0, max: 1_000_000 }),
  sizeDeltaCents: fc.integer({ min: -50_000, max: 50_000 }),
  addOnPricesCents: fc.array(fc.integer({ min: 0, max: 100_000 }), {
    maxLength: 6,
  }),
  quantity: fc.integer({ min: 1, max: 20 }),
});

const statusArb: fc.Arbitrary<OrderStatusType> = fc.constantFrom(
  OrderStatus.PENDING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED
);

const nonPendingStatusArb: fc.Arbitrary<OrderStatusType> = fc.constantFrom(
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED
);

describe("orderRules unit tests", () => {
  it("accepts an items edit while PENDING and recomputes the total", () => {
    const items: ResolvedOrderItem[] = [
      { basePriceCents: 10000, sizeDeltaCents: 0, addOnPricesCents: [500], quantity: 2 },
    ];
    const result = applyItemsEdit(OrderStatus.PENDING, items);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.totalPriceCents).toBe(21000);
    }
  });

  it("rejects an items edit with 409 when not PENDING", () => {
    const result = applyItemsEdit(OrderStatus.READY, []);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.httpStatus).toBe(409);
    }
  });

  it("cancellation sets CANCELLED and refunds only when paid", () => {
    expect(applyCancellation(true)).toEqual({
      status: OrderStatus.CANCELLED,
      refunded: true,
    });
    expect(applyCancellation(false)).toEqual({
      status: OrderStatus.CANCELLED,
      refunded: false,
    });
  });
});

describe("Feature: coffee-shop-ordering-system, Property 3: PENDING-only edit guard", () => {
  it("rejects edits (409) for any non-PENDING status and recomputes total for PENDING", () => {
    fc.assert(
      fc.property(
        statusArb,
        fc.array(resolvedItemArb, { maxLength: 15 }),
        (status, newItems) => {
          const result = applyItemsEdit(status, newItems);
          if (status === OrderStatus.PENDING) {
            expect(result.accepted).toBe(true);
            if (result.accepted) {
              // Uses the same authoritative formula as Property 1.
              expect(result.totalPriceCents).toBe(
                computeOrderTotalCents(newItems)
              );
            }
          } else {
            expect(result.accepted).toBe(false);
            if (!result.accepted) {
              expect(result.httpStatus).toBe(409);
              expect(result.reason).toBe("NOT_PENDING");
            }
          }
        }
      )
    );
  });

  it("never accepts an edit for a non-PENDING status", () => {
    fc.assert(
      fc.property(
        nonPendingStatusArb,
        fc.array(resolvedItemArb, { maxLength: 15 }),
        (status, newItems) => {
          expect(applyItemsEdit(status, newItems).accepted).toBe(false);
        }
      )
    );
  });
});

describe("Feature: coffee-shop-ordering-system, Property 4: Cancellation and refund invariant", () => {
  it("after cancellation status is CANCELLED and refunded iff the order was paid", () => {
    fc.assert(
      fc.property(fc.boolean(), (isPaid) => {
        const result = applyCancellation(isPaid);
        expect(result.status).toBe(OrderStatus.CANCELLED);
        expect(result.refunded).toBe(isPaid);
      })
    );
  });
});
