"use client";

/**
 * Order Entry — touch-optimised layout.
 * All interactive elements meet the 44×44px minimum touch target (WCAG 2.5.5).
 */

import { useEffect, useMemo, useState } from "react";
import { computeRunningTotalCents } from "@/lib/pricing";
import type { ResolvedOrderItem } from "@/lib/types";
import { formatPesos } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────

type MenuSize  = { id: string; name: string; priceDeltaCents: number };
type MenuAddOn = { id: string; name: string; priceCents: number; available: boolean };
type MenuItem  = {
  id: string; name: string; description?: string | null;
  basePriceCents: number; category: string; available: boolean;
  sizes: MenuSize[]; addOns: MenuAddOn[];
};
type CartLine = {
  key: string; menuItemId: string; name: string;
  basePriceCents: number; sizeId: string | null; sizeName: string | null;
  sizeDeltaCents: number; addOns: { id: string; name: string; priceCents: number }[];
  quantity: number; notes: string;
};
type PM = "CASH" | "GCASH";

let counter = 0;
const nextKey = () => `line-${++counter}`;

// Shared input — tall enough for touch (py-3 = ~44px with text)
const inputCls =
  "w-full rounded-xl border border-roast/20 bg-cream px-4 py-3 text-base text-espresso " +
  "placeholder:text-latte focus:border-espresso focus:outline-none";

// Shared pill button factory
function pillCls(active: boolean) {
  return (
    "min-h-[40px] rounded-full border px-4 py-2 text-xs sm:text-sm font-bold transition-all shrink-0 active:scale-95 " +
    (active
      ? "border-espresso bg-espresso text-foam shadow-sm"
      : "border-roast/20 bg-foam text-roast hover:bg-latte/20")
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function OrderEntry() {
  const [menu, setMenu]           = useState<MenuItem[] | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  const ALL = "__all__";
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [configItemId,   setConfigItemId]   = useState<string | null>(null);

  const [selSize,   setSelSize]   = useState<Record<string, string>>({});
  const [selAddOns, setSelAddOns] = useState<Record<string, Set<string>>>({});
  const [qty,       setQty]       = useState<Record<string, number>>({});
  const [notes,     setNotes]     = useState<Record<string, string>>({});

  const [cart,         setCart]         = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [pm,           setPm]           = useState<PM>("CASH");
  const [gcashRef,     setGcashRef]     = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);
  const [lastNum,      setLastNum]      = useState<number | null>(null);

  // Load menu
  useEffect(() => {
    let cancelled = false;
    fetch("/api/menu")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Menu failed (${r.status})`);
        const d: MenuItem[] = await r.json();
        if (!cancelled) setMenu(d);
      })
      .catch((e) => { if (!cancelled) setMenuError(e instanceof Error ? e.message : "Failed to load menu."); });
    return () => { cancelled = true; };
  }, []);

  const availableMenu = useMemo(() => (menu ?? []).filter((i) => i.available), [menu]);

  const categories = useMemo(() => {
    const m = new Map<string, MenuItem[]>();
    for (const i of availableMenu) { const l = m.get(i.category) ?? []; l.push(i); m.set(i.category, l); }
    return [...m.entries()];
  }, [availableMenu]);

  useEffect(() => {
    if (categories.length > 0 && activeCategory === null) setActiveCategory(ALL);
  }, [categories, activeCategory]);

  const categoryItems = useMemo(
    () => activeCategory === ALL ? availableMenu : (categories.find(([c]) => c === activeCategory)?.[1] ?? []),
    [categories, activeCategory, availableMenu],
  );

  const configItem = useMemo(
    () => configItemId ? availableMenu.find((i) => i.id === configItemId) ?? null : null,
    [configItemId, availableMenu],
  );

  const resolvedCart: ResolvedOrderItem[] = useMemo(
    () => cart.map((l) => ({ basePriceCents: l.basePriceCents, sizeDeltaCents: l.sizeDeltaCents, addOnPricesCents: l.addOns.map((a) => a.priceCents), quantity: l.quantity })),
    [cart],
  );
  const runningTotal = computeRunningTotalCents(resolvedCart);

  function getSizeId(item: MenuItem) { return selSize[item.id] ?? item.sizes[0]?.id ?? null; }
  function getQty(id: string) { return qty[id] ?? 1; }
  function adjustQty(id: string, d: number) { setQty((p) => ({ ...p, [id]: Math.max(1, (p[id] ?? 1) + d) })); }
  function toggleAddOn(itemId: string, addOnId: string) {
    setSelAddOns((p) => { const s = new Set(p[itemId] ?? []); s.has(addOnId) ? s.delete(addOnId) : s.add(addOnId); return { ...p, [itemId]: s }; });
  }
  function previewTotal(item: MenuItem) {
    const size = item.sizes.find((s) => s.id === getSizeId(item));
    const addOns = item.addOns.filter((a) => a.available && (selAddOns[item.id] ?? new Set()).has(a.id)).map((a) => a.priceCents);
    return computeRunningTotalCents([{ basePriceCents: item.basePriceCents, sizeDeltaCents: size?.priceDeltaCents ?? 0, addOnPricesCents: addOns, quantity: getQty(item.id) }]);
  }

  function addToCart(item: MenuItem) {
    const sizeId = getSizeId(item);
    const size   = item.sizes.find((s) => s.id === sizeId) ?? null;
    const addOnIds = selAddOns[item.id] ?? new Set<string>();
    const chosenAddOns = item.addOns.filter((a) => a.available && addOnIds.has(a.id)).map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents }));
    setCart((p) => [...p, { key: nextKey(), menuItemId: item.id, name: item.name, basePriceCents: item.basePriceCents, sizeId: size?.id ?? null, sizeName: size?.name ?? null, sizeDeltaCents: size?.priceDeltaCents ?? 0, addOns: chosenAddOns, quantity: getQty(item.id), notes: (notes[item.id] ?? "").trim() }]);
    setSelAddOns((p) => ({ ...p, [item.id]: new Set() }));
    setQty((p) => ({ ...p, [item.id]: 1 }));
    setNotes((p) => ({ ...p, [item.id]: "" }));
    setConfigItemId(null);
    setLastNum(null); setSubmitError(null);
  }

  async function submitOrder() {
    if (!cart.length) return;
    setSubmitting(true); setSubmitError(null); setLastNum(null);
    try {
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: customerName.trim() || undefined, paymentMethod: pm, ...(pm === "GCASH" && gcashRef.trim() ? { paymentRef: gcashRef.trim() } : {}), items: cart.map((l) => ({ menuItemId: l.menuItemId, sizeId: l.sizeId ?? undefined, quantity: l.quantity, notes: l.notes || undefined, addOnIds: l.addOns.map((a) => a.id) })) }) });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error((b?.error || b?.message) ?? `Failed (${res.status})`); }
      const order = await res.json();
      setLastNum(order.dailyNumber ?? null);
      setCart([]); setCustomerName(""); setGcashRef("");
    } catch (e) { setSubmitError(e instanceof Error ? e.message : "Failed to submit."); }
    finally { setSubmitting(false); }
  }

  if (menuError) return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{menuError}</p>;
  if (!menu)     return <p className="animate-pulse text-base text-roast">Loading menu…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">

      {/* ══ LEFT: Item Selection ════════════════════════════════════════════ */}
      <div className="space-y-4">

        {/* Category Pills (Wrap on all screen sizes) */}
        {categories.length > 0 && (
          <div className="pb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[["__all__", "All"] as [string, string], ...categories.map(([c]) => [c, c] as [string, string])].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setActiveCategory(val); setConfigItemId(null); }}
                  className={pillCls(activeCategory === val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Item grid */}
        {categories.length === 0 ? (
          <p className="text-base text-roast">No available items. Add some in Admin → Menu Management.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categoryItems.map((item) => {
              const isOpen = configItemId === item.id;
              return (
                <div key={item.id} className="contents">

                  {/* Item card */}
                  <button
                    type="button"
                    onClick={() => setConfigItemId(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    className={
                      "flex min-h-[96px] flex-col items-start rounded-2xl border p-4 text-left transition-all active:scale-95 " +
                      (isOpen
                        ? "border-espresso bg-espresso text-foam shadow-md"
                        : "border-roast/15 bg-foam text-espresso hover:border-roast/30 hover:shadow-xs")
                    }
                  >
                    <span className="text-sm sm:text-base font-bold leading-snug">{item.name}</span>
                    {item.description && (
                      <span className={"mt-1 line-clamp-2 text-xs " + (isOpen ? "text-foam/70" : "text-roast/70")}>
                        {item.description}
                      </span>
                    )}
                    <span className={"mt-auto pt-2 font-mono text-sm sm:text-base font-bold " + (isOpen ? "text-foam" : "text-roast")}>
                      {formatPesos(item.basePriceCents)}
                    </span>
                  </button>

                  {/* Config panel */}
                  {isOpen && configItem && (
                    <div className="col-span-full space-y-4 rounded-2xl border border-espresso/20 bg-foam p-4 sm:p-5 shadow-sm animate-in fade-in zoom-in-95 duration-150">

                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-roast/10 pb-3">
                        <div>
                          <p className="text-lg font-bold text-espresso">{configItem.name}</p>
                          {configItem.description && <p className="mt-0.5 text-xs text-roast">{configItem.description}</p>}
                        </div>
                        {/* Close button */}
                        <button
                          type="button"
                          onClick={() => setConfigItemId(null)}
                          aria-label="Close"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-roast hover:bg-latte/20 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Size pills */}
                      {configItem.sizes.length > 0 && (
                        <div>
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-roast">Size</p>
                          <div className="flex flex-wrap gap-2">
                            {configItem.sizes.map((s) => {
                              const on = getSizeId(configItem) === s.id;
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => setSelSize((p) => ({ ...p, [configItem.id]: s.id }))}
                                  aria-pressed={on}
                                  className={
                                    "rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold transition-all active:scale-95 min-h-[38px] " +
                                    (on
                                      ? "border-espresso bg-espresso text-foam shadow-xs"
                                      : "border-roast/20 bg-cream text-roast hover:bg-latte/20")
                                  }
                                >
                                  {s.name}
                                  {s.priceDeltaCents !== 0 && (
                                    <span className={on ? " text-foam/80 font-mono" : " text-roast font-mono"}>
                                      {" "}{s.priceDeltaCents > 0 ? "+" : "−"}{formatPesos(Math.abs(s.priceDeltaCents))}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Add-on pills */}
                      {configItem.addOns.filter((a) => a.available).length > 0 && (
                        <div>
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-roast">Add-ons</p>
                          <div className="flex flex-wrap gap-2">
                            {configItem.addOns.filter((a) => a.available).map((a) => {
                              const on = (selAddOns[configItem.id] ?? new Set()).has(a.id);
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => toggleAddOn(configItem.id, a.id)}
                                  aria-pressed={on}
                                  className={
                                    "rounded-full border px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 min-h-[38px] " +
                                    (on
                                      ? "border-espresso bg-espresso text-foam shadow-xs"
                                      : "border-roast/20 bg-cream text-roast hover:bg-latte/20")
                                  }
                                >
                                  {a.name}
                                  <span className={on ? " text-foam/80 font-mono" : " text-roast font-mono"}>
                                    {" "}+{formatPesos(a.priceCents)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Qty stepper + notes */}
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3.5">
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-roast">Qty</p>
                          <div className="flex items-center rounded-xl border border-roast/20 bg-cream w-fit">
                            <button
                              type="button"
                              onClick={() => adjustQty(configItem.id, -1)}
                              aria-label="Decrease quantity"
                              className="flex h-11 w-11 items-center justify-center rounded-l-xl text-xl font-bold text-espresso hover:bg-latte/20 active:bg-latte/40"
                            >
                              −
                            </button>
                            <span className="w-10 text-center text-base font-bold text-espresso font-mono">
                              {getQty(configItem.id)}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustQty(configItem.id, 1)}
                              aria-label="Increase quantity"
                              className="flex h-11 w-11 items-center justify-center rounded-r-xl text-xl font-bold text-espresso hover:bg-latte/20 active:bg-latte/40"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex-1">
                          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-roast">
                            Item Notes
                          </label>
                          <input
                            type="text"
                            value={notes[configItem.id] ?? ""}
                            onChange={(e) => setNotes((p) => ({ ...p, [configItem.id]: e.target.value }))}
                            placeholder="e.g. Less sweet, extra hot"
                            className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-sm text-espresso placeholder:text-roast/40 focus:border-espresso focus:outline-none min-h-[44px]"
                          />
                        </div>
                      </div>

                      {/* Add CTA */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-roast/10">
                        <p className="text-sm font-medium text-roast">
                          Item Total:{" "}
                          <span className="font-mono text-base font-bold text-espresso">{formatPesos(previewTotal(configItem))}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => addToCart(configItem)}
                          className="min-h-[44px] rounded-full bg-espresso px-6 py-2.5 text-sm font-bold text-foam shadow-sm hover:opacity-90 active:scale-95 transition-all text-center"
                        >
                          + Add to Order
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ RIGHT: Cart & Checkout ══════════════════════════════════════════ */}
      <aside className="h-fit space-y-4 rounded-2xl border border-roast/15 bg-foam p-4 sm:p-5 shadow-xs lg:sticky lg:top-6">

        <h3 className="text-xs font-bold uppercase tracking-widest text-roast">Current Order</h3>

        {/* Customer name */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">
            Customer Name (Optional)
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Maria"
            className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-sm text-espresso placeholder:text-roast/40 focus:border-espresso focus:outline-none min-h-[44px]"
          />
        </div>

        {/* Line items */}
        {cart.length === 0 ? (
          <p className="rounded-xl border border-dashed border-roast/20 py-8 text-center text-xs font-semibold text-roast/60">
            Tap an item above to add to order
          </p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {cart.map((line) => {
              const lineTotal = computeRunningTotalCents([{ basePriceCents: line.basePriceCents, sizeDeltaCents: line.sizeDeltaCents, addOnPricesCents: line.addOns.map((a) => a.priceCents), quantity: line.quantity }]);
              return (
                <li key={line.key} className="rounded-xl border border-roast/10 bg-cream/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-espresso leading-snug">
                        {line.quantity}× {line.name}
                        {line.sizeName && <span className="font-normal text-roast"> ({line.sizeName})</span>}
                      </p>
                      {line.addOns.length > 0 && (
                        <p className="mt-0.5 text-xs text-roast">+ {line.addOns.map((a) => a.name).join(", ")}</p>
                      )}
                      {line.notes && (
                        <p className="mt-0.5 text-xs italic text-roast/70">"{line.notes}"</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold text-espresso">{formatPesos(lineTotal)}</span>
                  </div>
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => setCart((p) => p.filter((l) => l.key !== line.key))}
                    className="mt-2 flex min-h-[36px] w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 text-xs font-bold text-red-700 hover:bg-red-100 active:scale-95 transition-all"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Total */}
        <div className="flex items-baseline justify-between border-t border-roast/10 pt-3">
          <span className="text-sm font-bold text-roast">Total Due</span>
          <span className="font-mono text-2xl font-black text-espresso" data-testid="running-total">
            {formatPesos(runningTotal)}
          </span>
        </div>

        {/* Payment toggle */}
        <div>
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">Payment Method</span>
          <div className="flex gap-2 rounded-full border border-roast/15 bg-cream p-1">
            {(["CASH", "GCASH"] as PM[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPm(p)}
                aria-pressed={pm === p}
                className={
                  "flex flex-1 min-h-[40px] items-center justify-center rounded-full text-xs font-bold transition-all active:scale-95 " +
                  (pm === p ? "bg-espresso text-foam shadow-xs" : "text-roast hover:bg-latte/20")
                }
              >
                {p === "CASH" ? "💵 Cash" : "📱 GCash"}
              </button>
            ))}
          </div>
        </div>

        {/* GCash ref */}
        {pm === "GCASH" && (
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">Reference No. (Optional)</label>
            <input
              type="text"
              value={gcashRef}
              onChange={(e) => setGcashRef(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-sm text-espresso placeholder:text-roast/40 focus:border-espresso focus:outline-none min-h-[44px]"
            />
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={submitOrder}
          disabled={!cart.length || submitting}
          className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-espresso text-sm font-bold text-foam shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
        >
          {submitting ? "Placing order…" : `Confirm Payment (${pm === "CASH" ? "Cash" : "GCash"})`}
        </button>

        {submitError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{submitError}</p>
        )}
        {lastNum !== null && (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-800" role="status">
            ✓ Order #{lastNum} placed successfully!
          </p>
        )}
      </aside>
    </div>
  );
}
