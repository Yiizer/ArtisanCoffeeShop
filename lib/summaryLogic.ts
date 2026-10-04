// Pure summary aggregation and history range snapping.
//
// Extended for Inventory, Costing & Profit:
// - costedRevenueCents, uncostedRevenueCents
// - cogsCents
// - grossProfitCents, marginPct
// - wasteCents, adjustmentsCents, unvaluedMovementCount
// - expensesCents, netProfitCents

import { OrderStatus } from "./types";
import type { OrderStatus as OrderStatusType, PaymentMethod } from "./types";
import { toDec, roundToCentavos } from "./decimal";

export type SummaryOrderItemRecord = {
  lineTotalCents: number | null;
  costCents: number | null;
};

export type SummaryOrderRecord = {
  businessDay: string; // YYYY-MM-DD
  status: OrderStatusType;
  isPaid: boolean;
  refunded: boolean;
  paymentMethod: PaymentMethod;
  totalPriceCents: number;
  costCents?: number | null;
  uncostedLines?: number;
  items?: SummaryOrderItemRecord[];
};

export type SummaryMovementRecord = {
  businessDay: string; // YYYY-MM-DD
  reason: "WASTE" | "ADJUSTMENT" | "OPENING" | "RESTOCK" | "SALE" | "RETURN";
  qtyChange: string | number | { toString(): string };
  unitCostCents: string | number | { toString(): string } | null;
};

export type SummaryExpenseRecord = {
  businessDay: string;
  amountCents: number;
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
  costedRevenueCents: number;
  uncostedRevenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  marginPct: number | null; // null if costedRevenueCents === 0
  wasteCents: number;
  adjustmentsCents: number;
  unvaluedMovementCount: number;
  expensesCents: number;
  netProfitCents: number;
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
 * Aggregate order records, stock movements, and expenses into a summary.
 */
export function aggregateSummary(
  orders: SummaryOrderRecord[],
  movements: SummaryMovementRecord[] = [],
  expenses: SummaryExpenseRecord[] = []
): SummaryAggregate {
  let totalOrders = 0;
  let cancelledOrders = 0;
  let revenueCents = 0;
  let refundedCents = 0;
  let cashCents = 0;
  let gcashCents = 0;
  let costedRevenueCents = 0;
  let cogsCents = 0;

  type DayAccumulator = {
    orders: number;
    revenueCents: number;
    costedRevenueCents: number;
    cogsCents: number;
    wasteCents: number;
    adjustmentsCents: number;
    expensesCents: number;
  };

  const perDay = new Map<string, DayAccumulator>();

  const getDay = (date: string): DayAccumulator => {
    let day = perDay.get(date);
    if (!day) {
      day = {
        orders: 0,
        revenueCents: 0,
        costedRevenueCents: 0,
        cogsCents: 0,
        wasteCents: 0,
        adjustmentsCents: 0,
        expensesCents: 0,
      };
      perDay.set(date, day);
    }
    return day;
  };

  for (const order of orders) {
    totalOrders += 1;
    if (order.status === OrderStatus.CANCELLED) cancelledOrders += 1;

    const day = getDay(order.businessDay);
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

      // Costing calculations
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (item.costCents !== null && item.costCents !== undefined) {
            const lineRev = item.lineTotalCents ?? 0;
            costedRevenueCents += lineRev;
            cogsCents += item.costCents;
            day.costedRevenueCents += lineRev;
            day.cogsCents += item.costCents;
          }
        }
      } else if (order.costCents !== null && order.costCents !== undefined) {
        // Fallback for orders without item-level snapshots
        costedRevenueCents += order.totalPriceCents;
        cogsCents += order.costCents;
        day.costedRevenueCents += order.totalPriceCents;
        day.cogsCents += order.costCents;
      }
    }
  }

  // Movements (Waste & Adjustments)
  let wasteCents = 0;
  let adjustmentsCents = 0;
  let unvaluedMovementCount = 0;

  for (const mov of movements) {
    const day = getDay(mov.businessDay);
    if (mov.reason === "WASTE") {
      if (mov.unitCostCents !== null && mov.unitCostCents !== undefined) {
        const qty = toDec(mov.qtyChange);
        const cost = toDec(mov.unitCostCents);
        // qtyChange for waste is negative, so - (qty * unitCost) is positive
        const loss = roundToCentavos(qty.times(cost).negated());
        wasteCents += loss;
        day.wasteCents += loss;
      } else {
        unvaluedMovementCount++;
      }
    } else if (mov.reason === "ADJUSTMENT") {
      if (mov.unitCostCents !== null && mov.unitCostCents !== undefined) {
        const qty = toDec(mov.qtyChange);
        const cost = toDec(mov.unitCostCents);
        // Net: shrinkage (negative qty) gives positive loss; gain (positive qty) offsets loss
        const loss = roundToCentavos(qty.times(cost).negated());
        adjustmentsCents += loss;
        day.adjustmentsCents += loss;
      } else {
        unvaluedMovementCount++;
      }
    }
  }

  // Expenses
  let expensesCents = 0;
  for (const exp of expenses) {
    const day = getDay(exp.businessDay);
    expensesCents += exp.amountCents;
    day.expensesCents += exp.amountCents;
  }

  const uncostedRevenueCents = revenueCents - costedRevenueCents;
  const grossProfitCents = costedRevenueCents - cogsCents;
  const marginPct = costedRevenueCents > 0 ? grossProfitCents / costedRevenueCents : null;
  const netProfitCents = grossProfitCents - wasteCents - adjustmentsCents - expensesCents;

  const dailyBreakdown: DailyBreakdown[] = Array.from(perDay.entries())
    .map(([date, v]) => ({
      date,
      orders: v.orders,
      revenueCents: v.revenueCents,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    totalOrders,
    cancelledOrders,
    revenueCents,
    refundedCents,
    cashCents,
    gcashCents,
    costedRevenueCents,
    uncostedRevenueCents,
    cogsCents,
    grossProfitCents,
    marginPct,
    wasteCents,
    adjustmentsCents,
    unvaluedMovementCount,
    expensesCents,
    netProfitCents,
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
