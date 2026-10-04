"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPesos } from "@/lib/format";
import { dayLabel, monthLabel, shiftDays, shiftMonths, snapToMonday, todayBusinessDay } from "./dateNav";
import MonthRevenueChart from "./MonthRevenueChart";
import type { AdminOrder, Summary, SummaryView } from "./types";

const VIEWS: SummaryView[] = ["day", "week", "month"];

export default function OrderHistory() {
  const [view, setView]           = useState<SummaryView>("day");
  const [anchorDate, setAnchor]   = useState(() => todayBusinessDay());
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [dayOrders, setDayOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        const sumRes = await fetch(`/api/admin/summary?view=${view}&anchorDate=${anchorDate}`);
        if (!sumRes.ok) throw new Error(`Summary failed (${sumRes.status}).`);
        const sum: Summary = await sumRes.json();

        let orders: AdminOrder[] = [];
        if (view === "day") {
          const oRes = await fetch(`/api/orders?date=${anchorDate}`);
          if (!oRes.ok) throw new Error(`Orders failed (${oRes.status}).`);
          orders = await oRes.json();
        }
        if (!cancelled) { setSummary(sum); setDayOrders(orders); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [view, anchorDate]);

  const changeView = useCallback((next: SummaryView) => {
    setView(next);
    if (next === "week") setAnchor((d) => snapToMonday(d));
  }, []);

  const navigate = useCallback((dir: -1 | 1) => {
    setAnchor((cur) => {
      if (view === "day")   return shiftDays(cur, dir);
      if (view === "week")  return snapToMonday(shiftDays(cur, dir * 7));
      return shiftMonths(cur, dir);
    });
  }, [view]);

  const drillIntoDay = useCallback((date: string) => { setView("day"); setAnchor(date); }, []);

  const periodLabel = summary
    ? view === "day"   ? dayLabel(summary.startDate)
    : view === "week"  ? `${dayLabel(summary.startDate)} – ${dayLabel(summary.endDate)}`
    : monthLabel(summary.startDate)
    : anchorDate;

  return (
    <div className="space-y-5 text-espresso">
      {/* Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-roast/10 pb-4">
        <div>
          <span className="text-[0.65rem] font-bold tracking-[0.22em] uppercase text-roast block">
            Financials & Analytics
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Profit & Order History
          </h2>
        </div>

        {/* View Switcher Pills */}
        <div
          role="tablist"
          aria-label="History view"
          className="flex items-center gap-1 rounded-full border border-roast/15 bg-cream p-1 shadow-2xs"
        >
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => changeView(v)}
              className={
                "flex-1 rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold capitalize transition-all select-none active:scale-95 min-h-[36px] " +
                (view === v
                  ? "bg-espresso text-foam shadow-xs"
                  : "text-roast hover:text-espresso hover:bg-latte/20")
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Period Navigation */}
      <div className="flex items-center justify-between sm:justify-center gap-2 sm:gap-4 bg-foam p-2.5 sm:p-3 rounded-2xl border border-roast/15 shadow-2xs">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-roast/20 bg-cream text-sm font-bold text-roast hover:bg-latte/30 active:scale-95 transition-all"
        >
          ←
        </button>
        <span className="text-center text-xs sm:text-sm font-bold text-espresso tracking-wide truncate px-1">
          {periodLabel}
        </span>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => navigate(1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-roast/20 bg-cream text-sm font-bold text-roast hover:bg-latte/30 active:scale-95 transition-all"
        >
          →
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-xs font-bold text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <p className="py-12 text-center text-xs text-roast font-medium">Loading history…</p>
      ) : summary ? (
        <div className="space-y-5">
          <SummaryCard summary={summary} />
          {view === "day"   && <DayTable orders={dayOrders} />}
          {view === "week"  && <WeekList summary={summary} onSelectDay={drillIntoDay} />}
          {view === "month" && <MonthRevenueChart dailyBreakdown={summary.dailyBreakdown} onSelectDay={drillIntoDay} />}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  const marginDisplay = summary.marginPct !== null ? `${(summary.marginPct * 100).toFixed(1)}%` : "—";

  return (
    <div className="space-y-3">
      {/* Primary Financial Overview Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">Revenue</p>
          <p className="mt-1 font-mono text-base font-black text-espresso">
            {formatPesos(summary.revenueCents)}
          </p>
          <p className="text-[10px] text-roast/60 mt-0.5">{summary.totalOrders} orders ({summary.cancelledOrders} cancelled)</p>
        </div>

        <div className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">COGS (Recipes)</p>
          <p className="mt-1 font-mono text-base font-bold text-roast">
            {formatPesos(summary.cogsCents)}
          </p>
          <p className="text-[10px] text-roast/60 mt-0.5">Ingredients cost</p>
        </div>

        <div className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">Gross Profit</p>
          <p className="mt-1 font-mono text-base font-black text-espresso">
            {formatPesos(summary.grossProfitCents)}
          </p>
          <p className="text-[10px] font-bold text-emerald-700 mt-0.5">Margin: {marginDisplay}</p>
        </div>

        <div className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">Waste Loss</p>
          <p className="mt-1 font-mono text-base font-bold text-red-700">
            -{formatPesos(summary.wasteCents)}
          </p>
          <p className="text-[10px] text-roast/60 mt-0.5">Spills & damaged</p>
        </div>

        <div className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">Stock Adjustments</p>
          <p className={`mt-1 font-mono text-base font-bold ${summary.adjustmentsCents > 0 ? "text-red-700" : summary.adjustmentsCents < 0 ? "text-emerald-700" : "text-roast"}`}>
            {summary.adjustmentsCents > 0 ? `-${formatPesos(summary.adjustmentsCents)}` : summary.adjustmentsCents < 0 ? `+${formatPesos(-summary.adjustmentsCents)}` : "₱0.00"}
          </p>
          <p className="text-[10px] text-roast/60 mt-0.5">Net inventory count</p>
        </div>

        <div className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">Expenses</p>
          <p className="mt-1 font-mono text-base font-bold text-red-700">
            -{formatPesos(summary.expensesCents)}
          </p>
          <p className="text-[10px] text-roast/60 mt-0.5">Rent, wages, supplies</p>
        </div>

        <div className="rounded-2xl border-2 border-espresso bg-cream/70 p-3.5 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-espresso">Net Profit</p>
          <p className={`mt-1 font-mono text-lg font-black ${summary.netProfitCents >= 0 ? "text-emerald-800" : "text-red-700"}`}>
            {formatPesos(summary.netProfitCents)}
          </p>
          <p className="text-[10px] font-bold text-espresso/70 mt-0.5">After all deductions</p>
        </div>
      </div>

      {/* Notices for uncosted revenue or unvalued movements */}
      {(summary.uncostedRevenueCents > 0 || summary.unvaluedMovementCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 flex flex-col sm:flex-row gap-2 justify-between">
          <div className="space-y-1">
            {summary.uncostedRevenueCents > 0 && (
              <p>
                ⚠️ <strong>{formatPesos(summary.uncostedRevenueCents)}</strong> in revenue is from items without a fully costed recipe and is excluded from profit calculations.
              </p>
            )}
            {summary.unvaluedMovementCount > 0 && (
              <p>
                ⚠️ <strong>{summary.unvaluedMovementCount}</strong> waste or stock adjustment records had no unit cost and could not be valued into net profit.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  PENDING:   "border-amber-400/40 bg-amber-100 text-amber-900",
  READY:     "border-blue-400/40 bg-blue-100 text-blue-900",
  COMPLETED: "border-emerald-500/40 bg-emerald-100 text-emerald-900",
  CANCELLED: "border-red-400/40 bg-red-100 text-red-900",
};

function DayTable({ orders }: { orders: AdminOrder[] }) {
  if (!orders.length) {
    return (
      <div className="rounded-2xl border border-dashed border-roast/20 bg-foam p-8 text-center text-xs font-semibold text-roast">
        No orders recorded for this day.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mobile Card List */}
      <div className="space-y-3 sm:hidden">
        {orders.map((o) => (
          <div key={o.id} className="rounded-2xl border border-roast/15 bg-foam p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-espresso text-base">
                #{o.dailyNumber} {o.customerName ? `· ${o.customerName}` : ""}
              </span>
              <span className={"rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase border " + (STATUS_CLS[o.status] ?? "bg-cream text-roast")}>
                {o.status}
              </span>
            </div>
            <p className="text-xs text-roast">
              {o.items.map((i) => `${i.quantity}× ${i.menuItem.name}`).join(", ")}
            </p>
            <div className="flex justify-between items-center text-xs pt-1 border-t border-roast/10 font-mono">
              <span className="font-bold text-espresso">{formatPesos(o.totalPriceCents)}</span>
              <span className="text-roast">
                Cost: {o.costCents !== null && o.costCents !== undefined ? formatPesos(o.costCents) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-hidden rounded-2xl border border-roast/15 bg-foam shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-roast/10 bg-cream/50 text-[10px] font-bold uppercase tracking-wider text-roast">
            <tr>
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Items</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Payment</th>
              <th className="py-3 px-4 text-right">Cost</th>
              <th className="py-3 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-roast/10">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-cream/40 transition">
                <td className="py-3 px-4 font-bold text-espresso">#{o.dailyNumber}</td>
                <td className="py-3 px-4 text-roast">{o.customerName || "—"}</td>
                <td className="py-3 px-4 text-roast max-w-xs truncate">
                  {o.items.map((i) => `${i.quantity}× ${i.menuItem.name}${i.size?.name ? ` (${i.size.name})` : ""}`).join(", ")}
                </td>
                <td className="py-3 px-4">
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border " + (STATUS_CLS[o.status] ?? "bg-cream text-roast")}>
                    {o.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-roast">
                  {o.paymentMethod} {o.isPaid ? "· Paid" : "· Unpaid"} {o.refunded ? "(Refunded)" : ""}
                </td>
                <td className="py-3 px-4 text-right font-mono text-roast">
                  {o.costCents !== null && o.costCents !== undefined ? formatPesos(o.costCents) : "—"}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-espresso">
                  {formatPesos(o.totalPriceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeekList({ summary, onSelectDay }: { summary: Summary; onSelectDay: (d: string) => void }) {
  return (
    <div className="space-y-2">
      {summary.dailyBreakdown.map((d) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onSelectDay(d.date)}
          className="flex w-full items-center justify-between rounded-xl border border-roast/15 bg-foam p-3 text-xs hover:bg-cream/60 transition shadow-2xs"
        >
          <span className="font-semibold text-espresso">{dayLabel(d.date)}</span>
          <div className="flex gap-4 font-mono">
            <span className="text-roast">{d.orders} {d.orders === 1 ? "order" : "orders"}</span>
            <span className="font-bold text-espresso">{formatPesos(d.revenueCents)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
