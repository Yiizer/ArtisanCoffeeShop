// Summary Service: server-computed history aggregates for the admin
// Order History section (day / week / month views).
//
// Strategy: snap the requested view to a Business_Day date range (using the
// pure range-snapping helpers in `lib/summaryLogic.ts`), fetch the orders that
// fall inside that range from Prisma, map each order to a pure
// `SummaryOrderRecord`, and compute the final aggregates with the pure
// `aggregateSummary` function. Because a range is bounded to at most one
// calendar month, fetching the rows and aggregating in-process is cheap and
// guarantees the revenue-exclusion rules match the design exactly (refunded and
// cancelled-unpaid orders are excluded from revenue; refunded amounts are
// reported separately).

import prisma from "./db";
import {
  getBusinessDay,
  businessDayStartUtcMs,
  businessDayEndUtcMs,
} from "./businessDay";
import {
  aggregateSummary,
  snapWeekRange,
  snapMonthRange,
} from "./summaryLogic";
import type { SummaryOrderRecord, DailyBreakdown } from "./summaryLogic";
import type { PaymentMethod } from "./types";

export type SummaryView = "day" | "week" | "month";

export type Summary = {
  view: SummaryView;
  startDate: string; // YYYY-MM-DD (Asia/Manila Business_Day)
  endDate: string; // YYYY-MM-DD
  totalOrders: number;
  cancelledOrders: number;
  revenueCents: number; // excludes refunded + cancelled-unpaid
  refundedCents: number; // separate line
  cashCents: number;
  gcashCents: number;
  dailyBreakdown: DailyBreakdown[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a YYYY-MM-DD string and confirm it is a real calendar date. */
export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidView(value: string): value is SummaryView {
  return value === "day" || value === "week" || value === "month";
}

/** Resolve the inclusive Business_Day date range for a view + anchor date. */
function resolveRange(
  view: SummaryView,
  anchorDate: string
): { startDate: string; endDate: string } {
  switch (view) {
    case "day":
      return { startDate: anchorDate, endDate: anchorDate };
    case "week":
      return snapWeekRange(anchorDate);
    case "month":
      return snapMonthRange(anchorDate);
  }
}

/** Enumerate every Business_Day date (inclusive) from start to end. */
function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const end = endDate;
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  // Guard against pathological inputs; a month range is at most 31 days.
  for (let i = 0; i < 400; i++) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    days.push(iso);
    if (iso === end) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Produce the summary aggregates for a view (`day`/`week`/`month`) anchored on
 * `anchorDate` (a YYYY-MM-DD Business_Day). The per-day breakdown covers every
 * day in the snapped range (days with no orders report 0), so the sum of daily
 * revenue still equals `revenueCents` and the sum of daily counts equals
 * `totalOrders`.
 */
export async function getSummary(
  view: SummaryView,
  anchorDate: string
): Promise<Summary> {
  const { startDate, endDate } = resolveRange(view, anchorDate);

  // The Business_Day range maps to a half-open [start, end) UTC timestamp
  // window: from 2 AM Manila on `startDate` to 2 AM Manila on the day after
  // `endDate`.
  const rangeStartMs = businessDayStartUtcMs(startDate);
  const rangeEndMs = businessDayEndUtcMs(endDate);

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: new Date(rangeStartMs),
        lt: new Date(rangeEndMs),
      },
    },
    select: {
      status: true,
      isPaid: true,
      refunded: true,
      paymentMethod: true,
      totalPriceCents: true,
      createdAt: true,
    },
  });

  const records: SummaryOrderRecord[] = orders.map((o) => ({
    businessDay: getBusinessDay(o.createdAt),
    status: o.status,
    isPaid: o.isPaid,
    refunded: o.refunded,
    paymentMethod: o.paymentMethod as PaymentMethod,
    totalPriceCents: o.totalPriceCents,
  }));

  const agg = aggregateSummary(records);

  // Fill the daily breakdown across the full range so views (especially the
  // month bar chart) show every day; reconciliation is preserved because
  // empty days contribute 0.
  const byDay = new Map(agg.dailyBreakdown.map((d) => [d.date, d]));
  const dailyBreakdown: DailyBreakdown[] = enumerateDays(
    startDate,
    endDate
  ).map(
    (date) => byDay.get(date) ?? { date, orders: 0, revenueCents: 0 }
  );

  return {
    view,
    startDate,
    endDate,
    totalOrders: agg.totalOrders,
    cancelledOrders: agg.cancelledOrders,
    revenueCents: agg.revenueCents,
    refundedCents: agg.refundedCents,
    cashCents: agg.cashCents,
    gcashCents: agg.gcashCents,
    dailyBreakdown,
  };
}
