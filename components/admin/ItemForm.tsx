"use client";

import { useState } from "react";

type SizeDraft  = { name: string; priceDeltaPesos: string };
type AddOnDraft = { name: string; pricePesos: string; available: boolean };

export type ItemDraft = {
  name: string;
  description: string;
  category: string;
  basePricePesos: string;
  available: boolean;
  sizes: SizeDraft[];
  addOns: AddOnDraft[];
};

const inputCls =
  "w-full rounded-md border border-roast/20 bg-cream px-2 py-1.5 text-sm text-espresso focus:border-espresso focus:outline-none";

export default function ItemForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: ItemDraft;
  submitLabel: string;
  onSubmit: (draft: ItemDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (partial: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...partial }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-roast/20 bg-foam p-4">
      <h3 className="mb-3 text-sm font-semibold text-espresso">{title}</h3>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-roast">
          Name
          <input className={inputCls} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-roast">
          Category
          <input className={inputCls} value={draft.category} onChange={(e) => patch({ category: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-roast">
          Base price (₱)
          <input className={inputCls} type="number" step="0.01" min="0" value={draft.basePricePesos} onChange={(e) => patch({ basePricePesos: e.target.value })} />
        </label>
        <label className="flex items-end gap-2 text-xs font-medium text-roast">
          <input type="checkbox" checked={draft.available} onChange={(e) => patch({ available: e.target.checked })} />
          Available
        </label>
        <label className="text-xs font-medium text-roast sm:col-span-2">
          Description (optional)
          <input className={inputCls} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
        </label>
      </div>

      {/* Sizes */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-roast">Sizes</p>
          <button type="button" onClick={() => patch({ sizes: [...draft.sizes, { name: "", priceDeltaPesos: "0" }] })} className="text-xs font-medium text-espresso hover:underline">
            + Add size
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {draft.sizes.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <input className={inputCls} placeholder="Size name" value={s.name} onChange={(e) => { const sizes = [...draft.sizes]; sizes[i] = { ...sizes[i], name: e.target.value }; patch({ sizes }); }} />
              <input className={inputCls + " max-w-28"} type="number" step="0.01" placeholder="Δ ₱" value={s.priceDeltaPesos} onChange={(e) => { const sizes = [...draft.sizes]; sizes[i] = { ...sizes[i], priceDeltaPesos: e.target.value }; patch({ sizes }); }} />
              <button type="button" onClick={() => patch({ sizes: draft.sizes.filter((_, j) => j !== i) })} className="shrink-0 rounded-md border border-roast/20 px-2 py-1 text-xs text-roast hover:bg-latte/20">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Add-ons */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-roast">Add-ons</p>
          <button type="button" onClick={() => patch({ addOns: [...draft.addOns, { name: "", pricePesos: "0", available: true }] })} className="text-xs font-medium text-espresso hover:underline">
            + Add add-on
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {draft.addOns.map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              <input className={inputCls} placeholder="Add-on name" value={a.name} onChange={(e) => { const addOns = [...draft.addOns]; addOns[i] = { ...addOns[i], name: e.target.value }; patch({ addOns }); }} />
              <input className={inputCls + " max-w-28"} type="number" step="0.01" min="0" placeholder="₱" value={a.pricePesos} onChange={(e) => { const addOns = [...draft.addOns]; addOns[i] = { ...addOns[i], pricePesos: e.target.value }; patch({ addOns }); }} />
              <label className="flex shrink-0 items-center gap-1 text-xs text-roast">
                <input type="checkbox" checked={a.available} onChange={(e) => { const addOns = [...draft.addOns]; addOns[i] = { ...addOns[i], available: e.target.checked }; patch({ addOns }); }} />
                Avail.
              </label>
              <button type="button" onClick={() => patch({ addOns: draft.addOns.filter((_, j) => j !== i) })} className="shrink-0 rounded-md border border-roast/20 px-2 py-1 text-xs text-roast hover:bg-latte/20">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" disabled={submitting} onClick={handleSubmit} className="rounded-md bg-espresso px-3 py-1.5 text-sm font-medium text-foam hover:opacity-90 disabled:opacity-50">
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-roast/20 px-3 py-1.5 text-sm font-medium text-roast hover:bg-latte/20">
          Cancel
        </button>
      </div>
    </div>
  );
}
