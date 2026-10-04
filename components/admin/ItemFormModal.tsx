"use client";

import { useEffect, useState, useId, useMemo } from "react";
import type { ItemDraft, RecipeIngredientDraft, SizeDraft, AddOnDraft } from "./ItemForm";
import type { AdminIngredient } from "./types";
import { formatPesos } from "@/lib/format";

interface ItemFormModalProps {
  isOpen: boolean;
  title: string;
  initial: ItemDraft;
  existingCategories: string[];
  submitLabel: string;
  onSubmit: (draft: ItemDraft) => Promise<void>;
  onClose: () => void;
}

export default function ItemFormModal({
  isOpen,
  title,
  initial,
  existingCategories,
  submitLabel,
  onSubmit,
  onClose,
}: ItemFormModalProps) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableIngredients, setAvailableIngredients] = useState<AdminIngredient[]>([]);
  const datalistId = useId();

  useEffect(() => {
    if (isOpen) {
      setDraft(initial);
      setError(null);
      // Fetch available ingredients
      fetch("/api/admin/ingredients")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setAvailableIngredients(data);
        })
        .catch(() => {});
    }
  }, [isOpen, initial]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  const patch = (partial: Partial<ItemDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));

  // Cost map: Map<ingredientId, unitCostCents (number or null)>
  const ingredientMap = useMemo(() => {
    const map = new Map<string, AdminIngredient>();
    for (const ing of availableIngredients) {
      map.set(ing.id, ing);
    }
    return map;
  }, [availableIngredients]);

  // Compute Base Cost Preview
  const baseCostCents = useMemo(() => {
    if (draft.noIngredients) return 0;
    if (!draft.ingredients.length) return null;

    let total = 0;
    for (const r of draft.ingredients) {
      const ing = ingredientMap.get(r.ingredientId);
      if (!ing || ing.unitCostCents === null) return null;
      const qty = Number(r.qty);
      if (isNaN(qty) || qty <= 0) continue;
      total += qty * Number(ing.unitCostCents);
    }
    return Math.round(total);
  }, [draft.noIngredients, draft.ingredients, ingredientMap]);

  // Warnings
  const warnings = useMemo(() => {
    const list: string[] = [];

    // 1. No recipe warning
    if (!draft.noIngredients && draft.ingredients.length === 0) {
      list.push("No recipe lines entered. This item will be uncosted unless 'No ingredients required' is checked.");
    }

    // 2. Null cost ingredient warning
    for (const r of draft.ingredients) {
      const ing = ingredientMap.get(r.ingredientId);
      if (ing && ing.unitCostCents === null) {
        list.push(`Ingredient "${ing.name}" has no cost set in Inventory. Lines using it will be uncosted.`);
      }
    }

    // 3. Negative delta exceeds base warning
    const baseQtyMap = new Map<string, number>();
    for (const r of draft.ingredients) {
      baseQtyMap.set(r.ingredientId, Number(r.qty) || 0);
    }

    for (const s of draft.sizes) {
      if (!s.ingredients) continue;
      for (const si of s.ingredients) {
        const base = baseQtyMap.get(si.ingredientId) ?? 0;
        const delta = Number(si.qtyDelta) || 0;
        if (base + delta < 0) {
          const ing = ingredientMap.get(si.ingredientId);
          list.push(
            `Size "${s.name}": ${ing?.name ?? "Ingredient"} delta ${delta} exceeds base ${base}, clamped to 0.`
          );
        }
      }
    }

    return list;
  }, [draft, ingredientMap]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError("Please enter an item name.");
      return;
    }
    if (!draft.category.trim()) {
      setError("Please enter or select a category.");
      return;
    }
    const price = Number(draft.basePricePesos);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid base price (₱0.00 or higher).");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-espresso/50 backdrop-blur-xs p-0 sm:p-4 transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl border border-roast/20 bg-foam shadow-2xl animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 flex flex-col text-espresso overflow-hidden">
        
        {/* Mobile Pull Bar */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 bg-cream/60">
          <div className="h-1 w-10 rounded-full bg-roast/30" />
        </div>

        {/* Sticky Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-roast/10 bg-cream/60 px-5 py-3.5 sm:px-6 sm:py-4">
          <div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-roast block">
              Menu & Recipe Management
            </span>
            <h3 id="item-modal-title" className="text-base sm:text-lg font-bold text-espresso">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-9 w-9 items-center justify-center rounded-full text-roast hover:bg-cream hover:text-espresso transition-colors font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 overscroll-contain">
          {error && (
            <div className="rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* Warnings Banner */}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-1 text-xs text-amber-900 shadow-2xs">
              {warnings.map((w, idx) => (
                <p key={idx} className="flex items-start gap-1.5">
                  <span>⚠️</span>
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}

          {/* Basic Item Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Item Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Spanish Latte"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2 text-sm font-semibold text-espresso focus:border-espresso focus:bg-foam focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Category <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                list={datalistId}
                placeholder="e.g. Espresso, Cold Brew, Pastry"
                value={draft.category}
                onChange={(e) => patch({ category: e.target.value })}
                className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2 text-sm font-semibold text-espresso focus:border-espresso focus:bg-foam focus:outline-none"
              />
              <datalist id={datalistId}>
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Base Price (₱) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={draft.basePricePesos}
                onChange={(e) => patch({ basePricePesos: e.target.value })}
                className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2 text-sm font-bold text-espresso font-mono focus:border-espresso focus:bg-foam focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Availability
              </label>
              <label className="flex items-center gap-2.5 h-[38px] rounded-xl border border-roast/20 bg-cream/50 px-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.available}
                  onChange={(e) => patch({ available: e.target.checked })}
                  className="h-4 w-4 rounded accent-espresso"
                />
                <span className="text-xs font-bold text-espresso">
                  {draft.available ? "Active on Counter" : "Hidden from Counter"}
                </span>
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Espresso with condensed milk"
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2 text-sm text-espresso focus:border-espresso focus:bg-foam focus:outline-none"
              />
            </div>
          </div>

          {/* Recipe Ingredients Section */}
          <div className="rounded-2xl border border-roast/15 bg-cream/40 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-roast/10 pb-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-espresso">
                  Base Recipe Ingredients
                </h4>
                <p className="text-[11px] text-roast">Quantities deducted per order item.</p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-roast cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.noIngredients}
                    onChange={(e) => patch({ noIngredients: e.target.checked })}
                    className="h-3.5 w-3.5 accent-espresso rounded"
                  />
                  <span>No ingredients required</span>
                </label>

                {!draft.noIngredients && (
                  <button
                    type="button"
                    onClick={() => {
                      if (availableIngredients.length === 0) return;
                      patch({
                        ingredients: [
                          ...draft.ingredients,
                          { ingredientId: availableIngredients[0].id, qty: "1" },
                        ],
                      });
                    }}
                    className="rounded-lg bg-espresso px-2.5 py-1 text-xs font-bold text-foam hover:opacity-90"
                  >
                    + Add Ingredient
                  </button>
                )}
              </div>
            </div>

            {!draft.noIngredients && (
              <div className="space-y-2">
                {draft.ingredients.length === 0 ? (
                  <p className="text-xs text-roast/70 py-2 italic text-center">
                    No ingredients added yet. Click "+ Add Ingredient" above.
                  </p>
                ) : (
                  draft.ingredients.map((r, i) => {
                    const ing = ingredientMap.get(r.ingredientId);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          className="flex-1 rounded-lg border border-roast/20 bg-foam px-3 py-1.5 text-xs text-espresso font-semibold"
                          value={r.ingredientId}
                          onChange={(e) => {
                            const ings = [...draft.ingredients];
                            ings[i] = { ...ings[i], ingredientId: e.target.value };
                            patch({ ingredients: ings });
                          }}
                        >
                          {availableIngredients.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.unit}) {a.unitCostCents ? `— ${formatPesos(Math.round(Number(a.unitCostCents)))}/${a.unit}` : "— No Cost"}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1 w-28">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="Qty"
                            className="w-full rounded-lg border border-roast/20 bg-foam px-2 py-1.5 text-xs text-espresso font-mono"
                            value={r.qty}
                            onChange={(e) => {
                              const ings = [...draft.ingredients];
                              ings[i] = { ...ings[i], qty: e.target.value };
                              patch({ ingredients: ings });
                            }}
                          />
                          <span className="text-xs text-roast font-semibold">{ing?.unit ?? ""}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            patch({ ingredients: draft.ingredients.filter((_, j) => j !== i) });
                          }}
                          className="p-1 text-xs font-bold text-roast hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}

                {/* Base Cost calculation display */}
                <div className="pt-2 flex justify-between items-center text-xs font-mono border-t border-roast/10">
                  <span className="text-roast">Base Recipe Cost:</span>
                  <span className="font-bold text-espresso">
                    {baseCostCents !== null ? formatPesos(baseCostCents) : "Unknown (Uncosted)"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sizes Section with Delta Ingredients & Cost/Margin Preview */}
          <div className="rounded-2xl border border-roast/15 bg-cream/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-roast/10 pb-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-espresso">
                  Sizes & Size Deltas
                </h4>
                <p className="text-[11px] text-roast">Adjust price and ingredient quantities per size.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({
                    sizes: [...draft.sizes, { name: "", priceDeltaPesos: "0", ingredients: [] }],
                  })
                }
                className="rounded-lg bg-espresso px-2.5 py-1 text-xs font-bold text-foam hover:opacity-90"
              >
                + Add Size
              </button>
            </div>

            <div className="space-y-3">
              {draft.sizes.map((s, i) => {
                const basePrice = Number(draft.basePricePesos) || 0;
                const deltaPrice = Number(s.priceDeltaPesos) || 0;
                const sizeFinalPricePesos = basePrice + deltaPrice;
                const sizeFinalPriceCents = Math.round(sizeFinalPricePesos * 100);

                // Compute size cost
                let sizeCostCents: number | null = baseCostCents;
                if (sizeCostCents !== null && s.ingredients) {
                  for (const si of s.ingredients) {
                    const ing = ingredientMap.get(si.ingredientId);
                    if (!ing || ing.unitCostCents === null) {
                      sizeCostCents = null;
                      break;
                    }
                    const dQty = Number(si.qtyDelta) || 0;
                    sizeCostCents += Math.round(dQty * Number(ing.unitCostCents));
                  }
                }

                const marginPct =
                  sizeCostCents !== null && sizeFinalPriceCents > 0
                    ? ((sizeFinalPriceCents - sizeCostCents) / sizeFinalPriceCents) * 100
                    : null;

                return (
                  <div key={i} className="rounded-xl border border-roast/15 bg-foam p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Size Name (e.g. Regular, Large)"
                        className="flex-1 rounded-lg border border-roast/20 bg-cream/70 px-3 py-1.5 text-xs text-espresso font-semibold"
                        value={s.name}
                        onChange={(e) => {
                          const sizes = [...draft.sizes];
                          sizes[i] = { ...sizes[i], name: e.target.value };
                          patch({ sizes });
                        }}
                      />
                      <div className="flex items-center gap-1 w-32">
                        <span className="text-xs text-roast font-mono font-bold">Δ₱</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          className="w-full rounded-lg border border-roast/20 bg-cream/70 px-2 py-1.5 text-xs text-espresso font-mono"
                          value={s.priceDeltaPesos}
                          onChange={(e) => {
                            const sizes = [...draft.sizes];
                            sizes[i] = { ...sizes[i], priceDeltaPesos: e.target.value };
                            patch({ sizes });
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          patch({ sizes: draft.sizes.filter((_, j) => j !== i) });
                        }}
                        className="p-1 text-xs text-roast hover:text-red-700 font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Size Delta Ingredients */}
                    <div className="pl-2 border-l-2 border-roast/20 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold text-roast">Ingredient Adjustment (Δ)</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (availableIngredients.length === 0) return;
                            const sizes = [...draft.sizes];
                            const curIngs = sizes[i].ingredients ?? [];
                            sizes[i] = {
                              ...sizes[i],
                              ingredients: [
                                ...curIngs,
                                { ingredientId: availableIngredients[0].id, qtyDelta: "0" },
                              ],
                            };
                            patch({ sizes });
                          }}
                          className="text-[10px] font-bold text-espresso hover:underline"
                        >
                          + Adjust Ingredient
                        </button>
                      </div>

                      {(s.ingredients ?? []).map((si, siIdx) => {
                        const ing = ingredientMap.get(si.ingredientId);
                        return (
                          <div key={siIdx} className="flex items-center gap-2">
                            <select
                              className="flex-1 rounded border border-roast/20 bg-cream px-2 py-1 text-xs text-espresso"
                              value={si.ingredientId}
                              onChange={(e) => {
                                const sizes = [...draft.sizes];
                                const curIngs = [...(sizes[i].ingredients ?? [])];
                                curIngs[siIdx] = { ...curIngs[siIdx], ingredientId: e.target.value };
                                sizes[i] = { ...sizes[i], ingredients: curIngs };
                                patch({ sizes });
                              }}
                            >
                              {availableIngredients.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.unit})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="any"
                              placeholder="Δ Qty (+/-)"
                              className="w-24 rounded border border-roast/20 bg-cream px-2 py-1 text-xs text-espresso font-mono"
                              value={si.qtyDelta}
                              onChange={(e) => {
                                const sizes = [...draft.sizes];
                                const curIngs = [...(sizes[i].ingredients ?? [])];
                                curIngs[siIdx] = { ...curIngs[siIdx], qtyDelta: e.target.value };
                                sizes[i] = { ...sizes[i], ingredients: curIngs };
                                patch({ sizes });
                              }}
                            />
                            <span className="text-[10px] text-roast font-semibold">{ing?.unit}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const sizes = [...draft.sizes];
                                sizes[i] = {
                                  ...sizes[i],
                                  ingredients: (sizes[i].ingredients ?? []).filter((_, k) => k !== siIdx),
                                };
                                patch({ sizes });
                              }}
                              className="text-[10px] text-roast hover:text-red-700 font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Size Preview Bar */}
                    <div className="pt-1 flex justify-between items-center text-[11px] font-mono border-t border-roast/10 bg-cream/30 px-2 py-1 rounded">
                      <span className="text-roast">
                        Price: <strong>{formatPesos(sizeFinalPriceCents)}</strong>
                      </span>
                      <span className="text-roast">
                        Cost: <strong>{sizeCostCents !== null ? formatPesos(sizeCostCents) : "—"}</strong>
                      </span>
                      <span className={marginPct !== null && marginPct > 40 ? "font-bold text-emerald-700" : "font-bold text-roast"}>
                        Margin: {marginPct !== null ? `${marginPct.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add-ons Section */}
          <div className="rounded-2xl border border-roast/15 bg-cream/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-roast/10 pb-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-espresso">
                  Add-Ons & Extras
                </h4>
                <p className="text-[11px] text-roast">Extra shots, syrups, or toppings.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({
                    addOns: [
                      ...draft.addOns,
                      { name: "", pricePesos: "0", available: true, noIngredients: false, ingredients: [] },
                    ],
                  })
                }
                className="rounded-lg bg-espresso px-2.5 py-1 text-xs font-bold text-foam hover:opacity-90"
              >
                + Add Add-On
              </button>
            </div>

            <div className="space-y-3">
              {draft.addOns.map((a, i) => (
                <div key={i} className="rounded-xl border border-roast/15 bg-foam p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      placeholder="Add-on Name (e.g. Vanilla Syrup)"
                      className="flex-1 rounded-lg border border-roast/20 bg-cream/70 px-3 py-1.5 text-xs text-espresso font-semibold"
                      value={a.name}
                      onChange={(e) => {
                        const addOns = [...draft.addOns];
                        addOns[i] = { ...addOns[i], name: e.target.value };
                        patch({ addOns });
                      }}
                    />
                    <div className="flex items-center gap-1 w-28">
                      <span className="text-xs text-roast font-mono font-bold">₱</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="w-full rounded-lg border border-roast/20 bg-cream/70 px-2 py-1.5 text-xs text-espresso font-mono"
                        value={a.pricePesos}
                        onChange={(e) => {
                          const addOns = [...draft.addOns];
                          addOns[i] = { ...addOns[i], pricePesos: e.target.value };
                          patch({ addOns });
                        }}
                      />
                    </div>
                    <label className="flex items-center gap-1 text-[11px] text-roast cursor-pointer">
                      <input
                        type="checkbox"
                        checked={a.available}
                        onChange={(e) => {
                          const addOns = [...draft.addOns];
                          addOns[i] = { ...addOns[i], available: e.target.checked };
                          patch({ addOns });
                        }}
                        className="h-3.5 w-3.5 accent-espresso rounded"
                      />
                      <span>In Stock</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        patch({ addOns: draft.addOns.filter((_, j) => j !== i) });
                      }}
                      className="p-1 text-xs text-roast hover:text-red-700 font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  {/* AddOn Recipe */}
                  <div className="pl-2 border-l-2 border-roast/20 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="flex items-center gap-1 text-[10px] text-roast cursor-pointer">
                        <input
                          type="checkbox"
                          checked={a.noIngredients}
                          onChange={(e) => {
                            const addOns = [...draft.addOns];
                            addOns[i] = { ...addOns[i], noIngredients: e.target.checked };
                            patch({ addOns });
                          }}
                          className="h-3 w-3 accent-espresso rounded"
                        />
                        <span>No ingredients required</span>
                      </label>

                      {!a.noIngredients && (
                        <button
                          type="button"
                          onClick={() => {
                            if (availableIngredients.length === 0) return;
                            const addOns = [...draft.addOns];
                            const cur = addOns[i].ingredients ?? [];
                            addOns[i] = {
                              ...addOns[i],
                              ingredients: [
                                ...cur,
                                { ingredientId: availableIngredients[0].id, qty: "1" },
                              ],
                            };
                            patch({ addOns });
                          }}
                          className="text-[10px] font-bold text-espresso hover:underline"
                        >
                          + Add Ingredient
                        </button>
                      )}
                    </div>

                    {!a.noIngredients &&
                      (a.ingredients ?? []).map((ai, aiIdx) => {
                        const ing = ingredientMap.get(ai.ingredientId);
                        return (
                          <div key={aiIdx} className="flex items-center gap-2">
                            <select
                              className="flex-1 rounded border border-roast/20 bg-cream px-2 py-1 text-xs text-espresso"
                              value={ai.ingredientId}
                              onChange={(e) => {
                                const addOns = [...draft.addOns];
                                const cur = [...(addOns[i].ingredients ?? [])];
                                cur[aiIdx] = { ...cur[aiIdx], ingredientId: e.target.value };
                                addOns[i] = { ...addOns[i], ingredients: cur };
                                patch({ addOns });
                              }}
                            >
                              {availableIngredients.map((ingItem) => (
                                <option key={ingItem.id} value={ingItem.id}>
                                  {ingItem.name} ({ingItem.unit})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Qty"
                              className="w-20 rounded border border-roast/20 bg-cream px-2 py-1 text-xs text-espresso font-mono"
                              value={ai.qty}
                              onChange={(e) => {
                                const addOns = [...draft.addOns];
                                const cur = [...(addOns[i].ingredients ?? [])];
                                cur[aiIdx] = { ...cur[aiIdx], qty: e.target.value };
                                addOns[i] = { ...addOns[i], ingredients: cur };
                                patch({ addOns });
                              }}
                            />
                            <span className="text-[10px] text-roast font-semibold">{ing?.unit}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const addOns = [...draft.addOns];
                                addOns[i] = {
                                  ...addOns[i],
                                  ingredients: (addOns[i].ingredients ?? []).filter((_, k) => k !== aiIdx),
                                };
                                patch({ addOns });
                              }}
                              className="text-[10px] text-roast hover:text-red-700 font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-roast/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-roast/20 px-5 py-2.5 text-sm font-semibold text-roast hover:bg-cream active:scale-95 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-espresso px-6 py-2.5 text-sm font-bold text-foam shadow-sm hover:opacity-90 active:scale-95 transition disabled:opacity-50"
            >
              {submitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
