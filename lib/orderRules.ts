// Pure order-mutation guards: the PENDING-only items-edit guard and the
// cancellation/refund rule. These are decoupled from persistence so they can be
// reused by the Order Service and exhaustively property-tested.

import { computeOrderTotalCents } from "./pricing";
import { OrderStatus } from "./types";
import type { OrderStatus as OrderStatusType, ResolvedOrderItem } from "./types";

export type EditGuardResult =
  | { accepted: true; totalPriceCents: number }
  | { accepted: false; httpStatus: 409; reason: "NOT_PENDING" };

/**
 * Decide whether an items/quantities/notes edit may be applied to an order.
 *
 * Edits are permitted only while the current stored status is `PENDING`. When
 * accepted, the order's `totalPriceCents` is recomputed with the same
 * server-authoritative formula used at creation. When rejected, the caller must
 * leave the order's items and total unchanged (the guard returns a 409 signal).
 */
export function applyItemsEdit(
  currentStatus: OrderStatusType,
  newItems: ResolvedOrderItem[]
): EditGuardResult {
  if (currentStatus !== OrderStatus.PENDING) {
    return { accepted: false, httpStatus: 409, reason: "NOT_PENDING" };
  }
  return { accepted: true, totalPriceCents: computeOrderTotalCents(newItems) };
}

export type CancellationResult = {
  status: typeof OrderStatus.CANCELLED;
  refunded: boolean;
};

/**
 * Compute an order's post-cancellation state. The status becomes `CANCELLED`
 * and `refunded` is true if and only if the order was paid at cancellation
 * time.
 */
export function applyCancellation(isPaid: boolean): CancellationResult {
  return { status: OrderStatus.CANCELLED, refunded: isPaid };
}
