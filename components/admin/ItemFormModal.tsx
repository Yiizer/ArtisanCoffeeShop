"use client";

import { useEffect, useState, useId } from "react";
import type { ItemDraft } from "./ItemForm";

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
  const datalistId = useId();

  useEffect(() => {
    if (isOpen) {
      setDraft(initial);
      setError(null);
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

  if (!isOpen) return null;

  const patch = (partial: Partial<ItemDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));

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
      <div className="w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl border border-roast/20 bg-foam shadow-2xl animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 flex flex-col text-espresso overflow-hidden">
        
        {/* Mobile Pull Bar Indicator */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 bg-cream/60">
          <div className="h-1 w-10 rounded-full bg-roast/30" />
        </div>

        {/* Sticky Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-roast/10 bg-cream/60 px-5 py-3.5 sm:px-6 sm:py-4">
          <div>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-roast block">
              Artisan Menu
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
          {error && (
            <div className="rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* Item Name */}
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
              className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2.5 text-base sm:text-sm font-semibold text-espresso placeholder-roast/40 focus:border-espresso focus:bg-foam focus:outline-none transition-colors"
            />
          </div>

          {/* Category */}
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
              className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2.5 text-base sm:text-sm font-semibold text-espresso placeholder-roast/40 focus:border-espresso focus:bg-foam focus:outline-none transition-colors"
            />
            <datalist id={datalistId}>
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            {existingCategories.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-roast mr-1">Suggestions:</span>
                {existingCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patch({ category: c })}
                    className={
                      "rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95 " +
                      (draft.category.trim() === c
                        ? "bg-espresso text-foam shadow-sm"
                        : "bg-cream text-roast border border-roast/15 hover:bg-latte/30")
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price & Availability */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Base Price (₱) <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-roast font-mono">
                  ₱
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={draft.basePricePesos}
                  onChange={(e) => patch({ basePricePesos: e.target.value })}
                  className="w-full rounded-xl border border-roast/20 bg-cream/70 pl-8 pr-4 py-2.5 text-base sm:text-sm font-bold text-espresso placeholder-roast/40 focus:border-espresso focus:bg-foam focus:outline-none font-mono transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
                Stock Status
              </label>
              <label className="flex items-center gap-2.5 h-[44px] rounded-xl border border-roast/20 bg-cream/50 px-3.5 cursor-pointer select-none active:bg-cream">
                <input
                  type="checkbox"
                  checked={draft.available}
                  onChange={(e) => patch({ available: e.target.checked })}
                  className="h-4 w-4 rounded accent-espresso cursor-pointer"
                />
                <span className="text-xs font-bold text-espresso">
                  {draft.available ? "● In Stock (Available)" : "○ Sold Out (Unavailable)"}
                </span>
              </label>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Rich espresso with sweetened condensed milk and cinnamon."
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              className="w-full rounded-xl border border-roast/20 bg-cream/70 px-4 py-2.5 text-base sm:text-sm text-espresso placeholder-roast/40 focus:border-espresso focus:bg-foam focus:outline-none transition-colors"
            />
          </div>

          {/* Sizes Section */}
          <div className="rounded-2xl border border-roast/15 bg-cream/40 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-espresso">
                  Size Options (Optional)
                </h4>
                <p className="text-[11px] text-roast">Configure sizes with price adjustments.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({
                    sizes: [
                      ...draft.sizes,
                      { name: draft.sizes.length === 0 ? "Regular" : "Large", priceDeltaPesos: "0" },
                    ],
                  })
                }
                className="rounded-full bg-espresso px-3 py-1.5 text-xs font-bold text-foam hover:opacity-90 active:scale-95 transition-all"
              >
                + Add Size
              </button>
            </div>

            {draft.sizes.length > 0 && (
              <div className="space-y-2 pt-1">
                {draft.sizes.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      placeholder="Size name"
                      value={s.name}
                      onChange={(e) => {
                        const sizes = [...draft.sizes];
                        sizes[i] = { ...sizes[i], name: e.target.value };
                        patch({ sizes });
                      }}
                      className="flex-1 min-w-0 rounded-xl border border-roast/20 bg-foam px-3 py-2 text-base sm:text-xs font-semibold text-espresso focus:border-espresso focus:outline-none"
                    />
                    <div className="relative w-20 sm:w-28 shrink-0">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-bold text-roast font-mono">
                        ±₱
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={s.priceDeltaPesos}
                        onChange={(e) => {
                          const sizes = [...draft.sizes];
                          sizes[i] = { ...sizes[i], priceDeltaPesos: e.target.value };
                          patch({ sizes });
                        }}
                        className="w-full rounded-xl border border-roast/20 bg-foam pl-7 sm:pl-8 pr-2 sm:pr-2.5 py-2 text-base sm:text-xs font-bold text-espresso focus:border-espresso focus:outline-none font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => patch({ sizes: draft.sizes.filter((_, j) => j !== i) })}
                      className="flex h-9 w-9 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-roast hover:bg-red-50 hover:text-red-700 active:scale-95 transition-all font-bold text-sm"
                      title="Remove size"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add-ons Section */}
          <div className="rounded-2xl border border-roast/15 bg-cream/40 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-espresso">
                  Add-ons & Modifiers (Optional)
                </h4>
                <p className="text-[11px] text-roast">Extra syrups, espresso shots, or plant milks.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({
                    addOns: [
                      ...draft.addOns,
                      { name: "", pricePesos: "0", available: true },
                    ],
                  })
                }
                className="rounded-full bg-espresso px-3 py-1.5 text-xs font-bold text-foam hover:opacity-90 active:scale-95 transition-all"
              >
                + Add Add-on
              </button>
            </div>

            {draft.addOns.length > 0 && (
              <div className="space-y-2 pt-1">
                {draft.addOns.map((a, i) => (
                  <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-foam/60 p-2 sm:p-0 rounded-xl sm:bg-transparent">
                    <input
                      type="text"
                      placeholder="Add-on name (e.g. Oat Milk)"
                      value={a.name}
                      onChange={(e) => {
                        const addOns = [...draft.addOns];
                        addOns[i] = { ...addOns[i], name: e.target.value };
                        patch({ addOns });
                      }}
                      className="flex-1 min-w-[130px] rounded-xl border border-roast/20 bg-foam px-3 py-2 text-base sm:text-xs font-semibold text-espresso focus:border-espresso focus:outline-none"
                    />
                    <div className="relative w-24 shrink-0">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs font-bold text-roast font-mono">
                        +₱
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={a.pricePesos}
                        onChange={(e) => {
                          const addOns = [...draft.addOns];
                          addOns[i] = { ...addOns[i], pricePesos: e.target.value };
                          patch({ addOns });
                        }}
                        className="w-full rounded-xl border border-roast/20 bg-foam pl-8 pr-2.5 py-2 text-base sm:text-xs font-bold text-espresso focus:border-espresso focus:outline-none font-mono"
                      />
                    </div>

                    {/* Stock checkbox */}
                    <label
                      className={
                        "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold cursor-pointer select-none transition-colors " +
                        (a.available
                          ? "border-emerald-600/30 bg-emerald-900/10 text-emerald-950"
                          : "border-roast/20 bg-cream text-roast/70")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={a.available}
                        onChange={(e) => {
                          const addOns = [...draft.addOns];
                          addOns[i] = { ...addOns[i], available: e.target.checked };
                          patch({ addOns });
                        }}
                        className="h-3.5 w-3.5 rounded accent-espresso cursor-pointer"
                      />
                      <span>{a.available ? "In Stock" : "86'd"}</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => patch({ addOns: draft.addOns.filter((_, j) => j !== i) })}
                      className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-full text-roast hover:bg-red-50 hover:text-red-700 active:scale-95 transition-all font-bold text-sm ml-auto sm:ml-0"
                      title="Remove add-on"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sticky Bottom Actions Bar */}
          <div className="pt-2">
            <button type="submit" className="hidden" aria-hidden="true" />
          </div>
        </form>

        {/* Sticky Action Footer */}
        <div className="shrink-0 flex items-center justify-end gap-3 border-t border-roast/10 bg-cream/50 px-5 py-3.5 sm:px-6 sm:py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="flex-1 sm:flex-none rounded-full border border-roast/20 bg-foam px-5 py-2.5 text-xs font-bold text-roast hover:bg-cream transition-colors active:scale-95 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="flex-1 sm:flex-none rounded-full bg-espresso px-6 py-2.5 text-xs font-bold text-foam shadow-sm hover:opacity-90 disabled:opacity-50 transition-all active:scale-95 min-h-[44px]"
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
