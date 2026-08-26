// Pure summary aggregation and history range snapping.
//
// The aggregation here mirrors what the Summary Service computes in the
// database (SUM / COUNT / GROUP BY DATE). Keeping a pure reference
// implementation lets us property-test the revenue-exclusion and reconciliation
// invariants without a database. Range snapping operates on Business_Day date
// strings (YYYY-MM-DD); the 2 AM Asia/Manila boundary is already applied when
// timestamps are mapped to business days by `lib/businessDay.ts`.

import { OrderStatus } from "./types";
import type { OrderStatus as OrderStatusType, PaymentMethod } from "./types";

export type SummaryOrderRecord = {
  businessDay: string; // YYYY-MM-DD
  status: OrderStatusType;
  isPaid: boolean;
  refunded: boolean;
  paymentMethod: PaymentMethod;
  totalPriceCents: number;
};

export type DailyBreakdown = {
  date: string;
  orders: number;
  revenueCents: number;
};

export type SummaryAggregate = {
  totalOrders: number;
  cancelledOrders: number;
  revenueCents: number;
  refundedCents: number;
  cashCents: number;
  gcashCents: number;
  dailyBreakdown: DailyBreakdown[];
};

/**
 * An order contributes to Revenue unless it was refunded or it was cancelled
 * while unpaid (which contributes ₱0). All other orders count at their frozen
 * `totalPriceCents`.
 */
export function contributesToRevenue(order: SummaryOrderRecord): boolean {
  if (order.refunded) return false;
  if (order.status === OrderStatus.CANCELLED && !order.isPaid) return false;
  return true;
}

/**
 * Aggregate a set of order records into a summary. `revenueCents` excludes
 * refunded and cancelled-unpaid orders; `refundedCents` sums refunded orders
 * (disjoint from revenue). Counts include every order. The per-day breakdown is
 * sorted ascending by date and reconciles with the top-level totals.
 */
export function aggregateSummary(
  orders: SummaryOrderRecord[]
): SummaryAggregate {
  let totalOrders = 0;
  let cancelledOrders = 0;
  let revenueCents = 0;
  let refundedCents = 0;
  let cashCents = 0;
  let gcashCents = 0;

  const perDay = new Map<string, { orders: number; revenueCents: number }>();

  for (const order of orders) {
    totalOrders += 1;
    if (order.status === OrderStatus.CANCELLED) cancelledOrders += 1;

    const day = perDay.get(order.businessDay) ?? {
      orders: 0,
      revenueCents: 0,
    };
    day.orders += 1;

    if (order.refunded) {
      refundedCents += order.totalPriceCents;
    }

    if (contributesToRevenue(order)) {
      revenueCents += order.totalPriceCents;
      day.revenueCents += order.totalPriceCents;
      if (order.paymentMethod === "CASH") {
        cashCents += order.totalPriceCents;
      } else {
        gcashCents += order.totalPriceCents;
      }
    }

    perDay.set(order.businessDay, day);
  }

  const dailyBreakdown: DailyBreakdown[] = Array.from(perDay.entries())
    .map(([date, v]) => ({ date, orders: v.orders, revenueCents: v.revenueCents }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    totalOrders,
    cancelledOrders,
    revenueCents,
    refundedCents,
    cashCents,
    gcashCents,
    dailyBreakdown,
  };
}

// --- Range snapping --------------------------------------------------------

export type DateRange = { startDate: string; endDate: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
}

function parse(businessDay: string): Date {
  const [year, month, day] = businessDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Snap an anchor Business_Day to its enclosing Monday–Sunday week range.
 */
export function snapWeekRange(anchorBusinessDay: string): DateRange {
  const date = parse(anchorBusinessDay);
  const dow = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysFromMonday = (dow + 6) % 7; // Monday = 0
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - daysFromMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { startDate: fmt(monday), endDate: fmt(sunday) };
}

/**
 * Snap an anchor Business_Day to its enclosing calendar-month range (first day
 * through last day of that month).
 */
export function snapMonthRange(anchorBusinessDay: string): DateRange {
  const [year, month] = anchorBusinessDay.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day
  return { startDate: fmt(start), endDate: fmt(end) };
}
