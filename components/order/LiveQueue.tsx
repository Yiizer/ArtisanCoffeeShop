"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPesos } from "@/lib/format";

const POLL_MS = 4000;

type OrderStatus = "PENDING" | "READY" | "COMPLETED" | "CANCELLED";
type QueueAddOn  = { id: string; addOn: { name: string; priceCents: number } };
type QueueItem   = { id: string; quantity: number; notes?: string | null; menuItem: { name: string }; size?: { name: string } | null; addOns: QueueAddOn[] };
type QueueOrder  = { id: string; dailyNumber: number; customerName?: string | null; status: OrderStatus; paymentMethod: "CASH" | "GCASH"; paymentRef?: string | null; isPaid: boolean; refunded: boolean; totalPriceCents: number; items: QueueItem[] };

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { PENDING: "READY", READY: "COMPLETED" };

const STATUS_CLS: Record<OrderStatus, string> = {
  PENDING:   "bg-latte/20 text-roast",
  READY:     "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function LiveQueue() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [busyId, setBusy]   = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch("/api/orders");
      if (!r.ok) throw new Error(`Queue failed (${r.status})`);
      const d: QueueOrder[] = await r.json();
      if (mounted.current) { setOrders(d); setError(null); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load queue.");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchOrders();
    const id = setInterval(fetchOrders, POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, [fetchOrders]);

  async function patch(id: string, body: unknown) {
    setBusy(id);
    try {
      const r = await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Update failed (${r.status})`);
      await fetchOrders();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update."); }
    finally { setBusy(null); }
  }

  async function cancel(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Cancel failed (${r.status})`);
      await fetchOrders();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to cancel."); }
    finally { setBusy(null); }
  }

  function describeItem(item: QueueItem) {
    const parts = [`${item.quantity}× ${item.menuItem.name}`];
    if (item.size?.name) parts.push(`(${item.size.name})`);
    if (item.addOns.length) parts.push(`+ ${item.addOns.map((a) => a.addOn.name).join(", ")}`);
    return parts.join(" ");
  }

  const activeOrders = orders.filter((o) => o.status === "PENDING" || o.status === "READY");
  const completedOrders = orders.filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED");

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {orders.length === 0 ? (
        <p className="text-sm text-roast">No orders yet for today. New orders appear here automatically.</p>
      ) : (
        <>
          {/* Active Orders Section */}
          {activeOrders.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-espresso">Active Orders</h3>
              <ul className="grid gap-4 sm:grid-cols-2">
                {activeOrders.map((order) => {
                  const next    = NEXT[order.status];
                  const busy    = busyId === order.id;
                  return (
                    <li key={order.id} className="rounded-lg border border-roast/10 bg-foam p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-semibold text-espresso">
                          #{order.dailyNumber}{order.customerName ? ` · ${order.customerName}` : ""}
                        </span>
                        <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + STATUS_CLS[order.status]}>
                          {order.status}
                        </span>
                      </div>

                      <ul className="mt-2 space-y-1 text-sm text-roast">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            {describeItem(item)}
                            {item.notes && <span className="block text-xs italic text-latte">"{item.notes}"</span>}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-semibold text-espresso">{formatPesos(order.totalPriceCents)}</span>
                        <span className="text-xs text-roast">
                          {order.paymentMethod} ·{" "}
                          {order.refunded
                            ? <span className="font-medium text-red-600">Refunded</span>
                            : order.isPaid
                            ? <span className="font-medium text-green-700">Paid</span>
                            : <span className="font-medium text-latte">Unpaid</span>}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {next && (
                          <button type="button" disabled={busy} onClick={() => patch(order.id, { kind: "status", status: next })}
                            className="flex min-h-[44px] items-center rounded-xl bg-espresso px-5 py-2.5 text-sm font-semibold text-foam hover:opacity-90 disabled:opacity-40">
                            → {next}
                          </button>
                        )}
                        {!order.isPaid && !order.refunded && (
                          <button type="button" disabled={busy} onClick={() => patch(order.id, { kind: "payment", isPaid: true })}
                            className="flex min-h-[44px] items-center rounded-xl border border-green-600 px-5 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-40">
                            Mark paid
                          </button>
                        )}
                        <button type="button" disabled={busy} onClick={() => cancel(order.id)}
                          className="flex min-h-[44px] items-center rounded-xl border border-red-400 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                          Cancel
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Completed/Cancelled Section */}
          {completedOrders.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-roast/60">Completed & Cancelled</h3>
              <ul className="grid gap-4 sm:grid-cols-2">
                {completedOrders.map((order) => {
                  return (
                    <li key={order.id} className="rounded-lg border border-roast/10 bg-foam/50 p-4 opacity-75">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-semibold text-espresso">
                          #{order.dailyNumber}{order.customerName ? ` · ${order.customerName}` : ""}
                        </span>
                        <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + STATUS_CLS[order.status]}>
                          {order.status}
                        </span>
                      </div>

                      <ul className="mt-2 space-y-1 text-sm text-roast">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            {describeItem(item)}
                            {item.notes && <span className="block text-xs italic text-latte">"{item.notes}"</span>}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-semibold text-espresso">{formatPesos(order.totalPriceCents)}</span>
                        <span className="text-xs text-roast">
                          {order.paymentMethod} ·{" "}
                          {order.refunded
                            ? <span className="font-medium text-red-600">Refunded</span>
                            : order.isPaid
                            ? <span className="font-medium text-green-700">Paid</span>
                            : <span className="font-medium text-latte">Unpaid</span>}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
