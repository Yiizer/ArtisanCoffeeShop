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
            Analytics
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Order History
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
      <div className="flex items-center justify-between sm:justify-center gap-3 bg-foam p-3 rounded-2xl border border-roast/15 shadow-2xs">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-roast/20 bg-cream text-sm font-bold text-roast hover:bg-latte/30 active:scale-95 transition-all"
        >
          ←
        </button>
        <span className="text-center text-xs sm:text-sm font-bold text-espresso tracking-wide">
          {periodLabel}
        </span>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => navigate(1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-roast/20 bg-cream text-sm font-bold text-roast hover:bg-latte/30 active:scale-95 transition-all"
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
  const stats = [
    { label: "Gross Revenue", value: formatPesos(summary.revenueCents), highlight: true },
    { label: "Refunded",      value: formatPesos(summary.refundedCents) },
    { label: "Total Orders",  value: String(summary.totalOrders) },
    { label: "Cancelled",     value: String(summary.cancelledOrders) },
    { label: "Cash Sales",    value: formatPesos(summary.cashCents) },
    { label: "GCash Sales",   value: formatPesos(summary.gcashCents) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-roast/70">{s.label}</p>
          <p className={"mt-1 font-mono text-base font-black " + (s.highlight ? "text-espresso" : "text-roast")}>
            {s.value}
          </p>
        </div>
      ))}
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
      {/* Mobile Card List for phones */}
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

            <ul className="text-xs text-roast space-y-0.5 border-t border-roast/10 pt-2">
              {o.items.map((it) => (
                <li key={it.id}>
                  {it.quantity}× {it.menuItem.name}
                  {it.size ? ` (${it.size.name})` : ""}
                  {it.addOns.length > 0 ? ` + ${it.addOns.map((a) => a.addOn.name).join(", ")}` : ""}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-roast/10 pt-2 text-xs">
              <span className="text-roast/80">
                {o.paymentMethod} {o.isPaid ? "· Paid" : "· Unpaid"}{o.refunded ? " (Refunded)" : ""}
              </span>
              <span className="font-mono font-bold text-sm text-espresso">
                {formatPesos(o.totalPriceCents)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop / Tablet Table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-roast/15 bg-foam shadow-2xs">
        <table className="min-w-full divide-y divide-roast/10 text-xs">
          <thead className="bg-cream/70 text-left uppercase tracking-wider text-roast font-bold">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-roast/5">
            {orders.map((o) => (
              <tr key={o.id} className="align-top hover:bg-cream/40 transition-colors">
                <td className="px-4 py-3 font-bold text-espresso">#{o.dailyNumber}</td>
                <td className="px-4 py-3 font-medium text-espresso">{o.customerName || "—"}</td>
                <td className="px-4 py-3 text-roast">
                  <ul className="space-y-0.5">
                    {o.items.map((it) => (
                      <li key={it.id}>
                        {it.quantity}× {it.menuItem.name}
                        {it.size ? ` (${it.size.name})` : ""}
                        {it.addOns.length > 0 ? ` + ${it.addOns.map((a) => a.addOn.name).join(", ")}` : ""}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-3">
                  <span className={"rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase border " + (STATUS_CLS[o.status] ?? "bg-cream text-roast")}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-roast font-medium">
                  {o.paymentMethod}{o.isPaid ? " · Paid" : " · Unpaid"}{o.refunded ? " · Refunded" : ""}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-sm text-espresso">{formatPesos(o.totalPriceCents)}</td>
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
    <ul className="divide-y divide-roast/10 rounded-2xl border border-roast/15 bg-foam overflow-hidden shadow-2xs">
      {summary.dailyBreakdown.map((d) => (
        <li key={d.date}>
          <button
            type="button"
            onClick={() => onSelectDay(d.date)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs sm:text-sm hover:bg-cream/50 active:bg-cream transition-colors"
          >
            <span className="font-bold text-espresso">{dayLabel(d.date)}</span>
            <span className="flex items-center gap-3">
              <span className="text-roast text-xs">{d.orders} {d.orders === 1 ? "order" : "orders"}</span>
              <span className="font-mono font-bold text-espresso">{formatPesos(d.revenueCents)}</span>
              <span className="text-roast text-xs">➔</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
