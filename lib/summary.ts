// Summary Service: server-computed history aggregates for the admin
// Order History section (day / week / month views).
// Extended for Inventory, Costing & Profit metrics.

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
import type {
  SummaryOrderRecord,
  SummaryMovementRecord,
  SummaryExpenseRecord,
  DailyBreakdown,
  SummaryAggregate,
} from "./summaryLogic";
import type { PaymentMethod } from "./types";

export type SummaryView = "day" | "week" | "month";

export type Summary = SummaryAggregate & {
  view: SummaryView;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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
 * Produce the summary aggregates for a view anchored on anchorDate.
 */
export async function getSummary(
  view: SummaryView,
  anchorDate: string
): Promise<Summary> {
  const { startDate, endDate } = resolveRange(view, anchorDate);

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
      costCents: true,
      uncostedLines: true,
      createdAt: true,
      items: {
        select: {
          lineTotalCents: true,
          costCents: true,
        },
      },
    },
  });

  const movements = await prisma.stockMovement.findMany({
    where: {
      createdAt: {
        gte: new Date(rangeStartMs),
        lt: new Date(rangeEndMs),
      },
      reason: { in: ["WASTE", "ADJUSTMENT"] },
    },
    select: {
      createdAt: true,
      reason: true,
      qtyChange: true,
      unitCostCents: true,
    },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      businessDay: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      businessDay: true,
      amountCents: true,
    },
  });

  const orderRecords: SummaryOrderRecord[] = orders.map((o) => ({
    businessDay: getBusinessDay(o.createdAt),
    status: o.status,
    isPaid: o.isPaid,
    refunded: o.refunded,
    paymentMethod: o.paymentMethod as PaymentMethod,
    totalPriceCents: o.totalPriceCents,
    costCents: o.costCents,
    uncostedLines: o.uncostedLines,
    items: (o.items ?? []).map((i) => ({
      lineTotalCents: i.lineTotalCents,
      costCents: i.costCents,
    })),
  }));

  const movementRecords: SummaryMovementRecord[] = movements.map((m) => ({
    businessDay: getBusinessDay(m.createdAt),
    reason: m.reason as "WASTE" | "ADJUSTMENT",
    qtyChange: m.qtyChange.toString(),
    unitCostCents: m.unitCostCents ? m.unitCostCents.toString() : null,
  }));

  const expenseRecords: SummaryExpenseRecord[] = expenses.map((e) => ({
    businessDay: e.businessDay,
    amountCents: e.amountCents,
  }));

  const agg = aggregateSummary(orderRecords, movementRecords, expenseRecords);

  // Fill empty days in dailyBreakdown
  const byDay = new Map(agg.dailyBreakdown.map((d) => [d.date, d]));
  const dailyBreakdown: DailyBreakdown[] = enumerateDays(
    startDate,
    endDate
  ).map(
    (date) =>
      byDay.get(date) ?? {
        date,
        orders: 0,
        revenueCents: 0,
      }
  );

  return {
    view,
    startDate,
    endDate,
    ...agg,
    dailyBreakdown,
  };
}
