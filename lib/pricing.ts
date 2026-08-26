// Pure price/total computation over resolved menu data.
//
// This module owns the single source of truth for order pricing. All arithmetic
// is performed in integer centavos so there is no floating-point error. The
// functions here never accept a client-supplied total: the server (and the
// display-only client running total) both derive the amount from menu data.

import type { ResolvedOrderItem } from "./types";

/**
 * Compute a single item's line total in centavos:
 *   quantity × (basePriceCents + sizeDeltaCents + Σ addOn priceCents)
 */
export function computeItemLineTotalCents(item: ResolvedOrderItem): number {
  const addOnsTotal = item.addOnPricesCents.reduce(
    (sum, priceCents) => sum + priceCents,
    0
  );
  const unitPriceCents = item.basePriceCents + item.sizeDeltaCents + addOnsTotal;
  return item.quantity * unitPriceCents;
}

/**
 * Compute an order's authoritative `totalPriceCents` as the sum of every item's
 * line total. This is the server-side formula; any client-provided total is
 * irrelevant because it is not an input to this function.
 */
export function computeOrderTotalCents(items: ResolvedOrderItem[]): number {
  return items.reduce((sum, item) => sum + computeItemLineTotalCents(item), 0);
}

/**
 * Display-only running total used by the order-entry UI as items are added.
 * It is implemented as an incremental fold to mirror how a UI accumulates a
 * running total, and by construction produces the same value as
 * {@link computeOrderTotalCents} for the same selection.
 */
export function computeRunningTotalCents(items: ResolvedOrderItem[]): number {
  let runningTotal = 0;
  for (const item of items) {
    runningTotal += computeItemLineTotalCents(item);
  }
  return runningTotal;
}
