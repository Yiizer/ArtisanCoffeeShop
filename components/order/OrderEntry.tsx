"use client";

/**
 * Order Entry — touch-optimised layout.
 * All interactive elements meet the 44×44px minimum touch target (WCAG 2.5.5).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeRunningTotalCents } from "@/lib/pricing";
import type { ResolvedOrderItem } from "@/lib/types";
import { formatPesos } from "@/lib/format";
import StaffStockModal from "./StaffStockModal";

// ── Types ──────────────────────────────────────────────────────────────────

type MenuSize  = { id: string; name: string; priceDeltaCents: number; inStock?: boolean };
type MenuAddOn = { id: string; name: string; priceCents: number; available: boolean; inStock?: boolean };
type MenuItem  = {
  id: string; name: string; description?: string | null;
  basePriceCents: number; category: string; available: boolean;
  inStock?: boolean;
  sizes: MenuSize[]; addOns: MenuAddOn[];
};
type CartLine = {
  key: string; menuItemId: string; name: string;
  basePriceCents: number; sizeId: string | null; sizeName: string | null;
  sizeDeltaCents: number; addOns: { id: string; name: string; priceCents: number }[];
  quantity: number; notes: string;
  inStock?: boolean;
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
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);

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
  const [cashReceived, setCashReceived] = useState("");
  const [lastChange,   setLastChange]   = useState<number | null>(null);

  // Mobile floating cart & drawer state
  const [cartOpen, setCartOpen]         = useState(false);
  const [badgeBump, setBadgeBump]       = useState(false);
  const badgeTimeoutRef                 = useRef<NodeJS.Timeout | null>(null);

  // Load menu
  const loadMenu = useCallback(async () => {
    try {
      const r = await fetch("/api/menu");
      if (!r.ok) throw new Error(`Menu failed (${r.status})`);
      const d: MenuItem[] = await r.json();
      setMenu(d);
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : "Failed to load menu.");
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // Clean up badge bump animation timer
  useEffect(() => {
    return () => {
      if (badgeTimeoutRef.current) clearTimeout(badgeTimeoutRef.current);
    };
  }, []);

  // Lock body scroll & handle Escape / viewport resize when mobile cart is open
  useEffect(() => {
    if (!cartOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCartOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024) setCartOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [cartOpen]);

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
  const cartItemCount = useMemo(() => cart.reduce((n, l) => n + l.quantity, 0), [cart]);

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
    const lineInStock = (item.inStock ?? true) && (size ? (size.inStock ?? true) : true);
    setCart((p) => [...p, { key: nextKey(), menuItemId: item.id, name: item.name, basePriceCents: item.basePriceCents, sizeId: size?.id ?? null, sizeName: size?.name ?? null, sizeDeltaCents: size?.priceDeltaCents ?? 0, addOns: chosenAddOns, quantity: getQty(item.id), notes: (notes[item.id] ?? "").trim(), inStock: lineInStock }]);
    setSelAddOns((p) => ({ ...p, [item.id]: new Set() }));
    setQty((p) => ({ ...p, [item.id]: 1 }));
    setNotes((p) => ({ ...p, [item.id]: "" }));
    setConfigItemId(null);
    setLastNum(null); setSubmitError(null);

    // Bump cart badge with micro-animation
    setBadgeBump(true);
    if (badgeTimeoutRef.current) clearTimeout(badgeTimeoutRef.current);
    badgeTimeoutRef.current = setTimeout(() => setBadgeBump(false), 300);
  }

  // Parse cash received as centavos for comparison with runningTotal
  const cashReceivedCents = cashReceived === "" ? null : Math.round(parseFloat(cashReceived) * 100);
  const cashIsValid = cashReceivedCents !== null && !isNaN(cashReceivedCents) && cashReceivedCents >= runningTotal;
  const cashIsInsufficient = cashReceivedCents !== null && !isNaN(cashReceivedCents) && cashReceivedCents < runningTotal;
  const changeCents = cashIsValid ? cashReceivedCents - runningTotal : 0;

  // Block submit when CASH is selected and amount is entered but insufficient
  const cashBlocked = pm === "CASH" && cashReceived !== "" && !cashIsValid;

  async function submitOrder() {
    if (!cart.length || cashBlocked) return;
    setSubmitting(true); setSubmitError(null); setLastNum(null); setLastChange(null);
    try {
      const isPaid = pm === "CASH" && cashIsValid;
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: customerName.trim() || undefined, paymentMethod: pm, ...(pm === "GCASH" && gcashRef.trim() ? { paymentRef: gcashRef.trim() } : {}), ...(isPaid ? { isPaid: true } : {}), items: cart.map((l) => ({ menuItemId: l.menuItemId, sizeId: l.sizeId ?? undefined, quantity: l.quantity, notes: l.notes || undefined, addOnIds: l.addOns.map((a) => a.id) })) }) });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error((b?.error || b?.message) ?? `Failed (${res.status})`); }
      const order = await res.json();
      setLastNum(order.dailyNumber ?? null);
      if (isPaid) setLastChange(changeCents);
      setCart([]); setCustomerName(""); setGcashRef(""); setCashReceived("");
    } catch (e) { setSubmitError(e instanceof Error ? e.message : "Failed to submit."); }
    finally { setSubmitting(false); }
  }

  if (menuError) return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{menuError}</p>;
  if (!menu)     return <p className="animate-pulse text-base text-roast">Loading menu…</p>;

  const checkoutPanel = (
    <>
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

      {/* Cash Received & Change Calculator */}
      {pm === "CASH" && (
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">Cash Received</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-roast/50">₱</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cashReceived}
              onChange={(e) => { setCashReceived(e.target.value); setLastNum(null); setLastChange(null); }}
              placeholder="0.00"
              className="w-full rounded-xl border border-roast/20 bg-cream pl-8 pr-3.5 py-2.5 text-base sm:text-sm text-espresso placeholder:text-roast/40 focus:border-espresso focus:outline-none min-h-[44px] font-mono"
            />
          </div>
          {cashReceived !== "" && (
            <div className="mt-2">
              {cashIsValid ? (
                <p className="flex items-baseline justify-between rounded-xl bg-green-50 px-3.5 py-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-green-700">Change</span>
                  <span className="font-mono text-xl font-black text-green-700">{formatPesos(changeCents)}</span>
                </p>
              ) : cashIsInsufficient ? (
                <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
                  ⚠ Insufficient — need {formatPesos(runningTotal - (cashReceivedCents ?? 0))} more
                </p>
              ) : (
                <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
                  ⚠ Enter a valid amount
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Soft Stock Warning */}
      {cart.some((l) => l.inStock === false) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          ⚠️ Some items in the cart are marked low/out of stock in the system. You can still proceed if physical supplies are on hand.
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={submitOrder}
        disabled={!cart.length || submitting || cashBlocked}
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
          {lastChange !== null && lastChange >= 0 && (
            <span className="block mt-1 font-mono text-lg text-green-700">
              Change: {formatPesos(lastChange)}
            </span>
          )}
        </p>
      )}
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">

      {/* ══ LEFT: Item Selection ════════════════════════════════════════════ */}
      <div className="space-y-4 pb-24 lg:pb-0">

        {/* Category Pills & Quick Stock Action */}
        <div className="flex items-center justify-between gap-3 pb-1 flex-wrap">
          {categories.length > 0 && (
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
          )}
          <button
            type="button"
            onClick={() => setIsStockModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-roast/20 bg-foam px-3.5 py-1.5 text-xs font-bold text-espresso shadow-xs hover:bg-cream active:scale-95 transition-all shrink-0 min-h-[38px]"
          >
            <span>📦</span>
            <span>Stock Actions</span>
          </button>
        </div>

        {/* Item grid */}
        {categories.length === 0 ? (
          <p className="text-base text-roast">No available items. Add some in Admin → Menu Management.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categoryItems.map((item) => {
              const isOpen = configItemId === item.id;
              const isOutOfStock = item.inStock === false;
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
                        : isOutOfStock
                        ? "border-roast/15 bg-cream/70 text-espresso/75"
                        : "border-roast/15 bg-foam text-espresso hover:border-roast/30 hover:shadow-xs")
                    }
                  >
                    <div className="flex items-start justify-between w-full gap-1">
                      <span className="text-sm sm:text-base font-bold leading-snug">{item.name}</span>
                      {isOutOfStock && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 shrink-0">
                          Out of Stock
                        </span>
                      )}
                    </div>
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
                              const outOfStock = s.inStock === false;
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
                                      : outOfStock
                                      ? "border-roast/15 bg-cream text-roast/50 line-through"
                                      : "border-roast/20 bg-cream text-roast hover:bg-latte/20")
                                  }
                                >
                                  {s.name}
                                  {outOfStock && (
                                    <span className="ml-1 text-[10px] font-normal no-underline opacity-75">(Out of stock)</span>
                                  )}
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
                              const outOfStock = a.inStock === false;
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
                                      : outOfStock
                                      ? "border-roast/15 bg-cream text-roast/50 line-through"
                                      : "border-roast/20 bg-cream text-roast hover:bg-latte/20")
                                  }
                                >
                                  {a.name}
                                  {outOfStock && (
                                    <span className="ml-1 text-[10px] font-normal no-underline opacity-75">(Low stock)</span>
                                  )}
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

      {/* ══ RIGHT: Cart & Checkout (Desktop) ════════════════════════════════ */}
      <aside className="hidden lg:block h-fit space-y-4 rounded-2xl border border-roast/15 bg-foam p-4 sm:p-5 shadow-xs lg:sticky lg:top-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-roast">Current Order</h3>
        {checkoutPanel}
      </aside>

      {/* ══ MOBILE: Floating Cart Bar (below lg) ════════════════════════════ */}
      <div
        className="fixed bottom-4 inset-x-4 z-40 lg:hidden pointer-events-none flex justify-center"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-label={cartItemCount > 0 ? `View order (${cartItemCount} items, total ${formatPesos(runningTotal)})` : "View order (cart empty)"}
          className={`pointer-events-auto flex items-center justify-between shadow-2xl transition-all active:scale-95 ${
            cartItemCount > 0
              ? "w-full max-w-md rounded-full bg-espresso px-5 py-3.5 text-foam hover:bg-espresso/95"
              : "w-auto min-w-[210px] rounded-full border border-roast/20 bg-espresso/90 px-4 py-2.5 text-foam/80 backdrop-blur-sm hover:bg-espresso/95"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <span className={cartItemCount > 0 ? "text-lg" : "text-base"}>🛒</span>
              {cartItemCount > 0 && (
                <span
                  className={`absolute -top-1.5 -right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-foam px-1 text-[11px] font-black text-espresso shadow-xs transition-transform duration-200 ${
                    badgeBump ? "scale-125 bg-amber-200" : "scale-100"
                  }`}
                >
                  {cartItemCount}
                </span>
              )}
            </div>
            <span className={`font-bold tracking-wide ${cartItemCount > 0 ? "text-sm text-foam" : "text-xs text-foam/90"}`}>
              {cartItemCount > 0 ? "View Order" : "Cart empty"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`font-mono font-bold ${cartItemCount > 0 ? "text-base text-foam" : "text-xs text-foam/75"}`}>
              {formatPesos(runningTotal)}
            </span>
            <span className={`opacity-75 ${cartItemCount > 0 ? "text-xs" : "text-[10px]"}`}>▲</span>
          </div>
        </button>
      </div>

      {/* ══ MOBILE: Bottom Sheet Drawer (below lg) ══════════════════════════ */}
      {cartOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Current Order"
          className="fixed inset-0 z-50 flex items-end justify-center bg-espresso/50 backdrop-blur-xs lg:hidden animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCartOpen(false);
          }}
        >
          <div className="w-full max-h-[90vh] flex flex-col rounded-t-3xl border-t border-roast/20 bg-foam shadow-2xl animate-in slide-in-from-bottom-6 duration-200 overflow-hidden text-espresso">
            {/* Drag Handle Bar */}
            <div
              className="flex justify-center pt-2.5 pb-1 bg-cream/80 cursor-pointer active:opacity-70"
              onClick={() => setCartOpen(false)}
              aria-label="Swipe or click to close"
            >
              <div className="h-1.5 w-12 rounded-full bg-roast/30" />
            </div>

            {/* Sheet Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-roast/10 bg-cream/80 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-espresso">Current Order</span>
                {cartItemCount > 0 && (
                  <span className="rounded-full bg-espresso px-2 py-0.5 text-xs font-bold text-foam font-mono">
                    {cartItemCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-roast hover:bg-latte/20 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Checkout Content */}
            <div
              className="overflow-y-auto p-4 sm:p-5 space-y-4"
              style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {checkoutPanel}
            </div>
          </div>
        </div>
      )}

      {/* Staff Stock Drawer / Modal */}
      <StaffStockModal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
        onMovementRecorded={loadMenu}
      />
    </div>
  );
}
