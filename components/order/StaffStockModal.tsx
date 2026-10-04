"use client";

import { useEffect, useState, useMemo } from "react";
import { formatPesos } from "@/lib/format";

type StaffIngredient = {
  id: string;
  name: string;
  unit: "G" | "ML" | "PC";
  stockQty: string;
  lowStockThreshold: string;
  isLowStock: boolean;
  isOutOfStock: boolean;
};

type Mode = "RESTOCK" | "WASTE";

interface StaffStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMovementRecorded?: () => void;
}

export default function StaffStockModal({
  isOpen,
  onClose,
  onMovementRecorded,
}: StaffStockModalProps) {
  const [ingredients, setIngredients] = useState<StaffIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("RESTOCK");
  const [selectedId, setSelectedId] = useState<string>("");
  const [qtyInput, setQtyInput] = useState<string>("");
  const [totalPaidPesos, setTotalPaidPesos] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadIngredients();
      setSuccessMsg(null);
      setError(null);
    }
  }, [isOpen]);

  async function loadIngredients() {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/ingredients");
      if (!res.ok) throw new Error(`Failed to load ingredients (${res.status})`);
      const data: StaffIngredient[] = await res.json();
      setIngredients(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ingredients.");
    } finally {
      setLoading(false);
    }
  }

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === selectedId) ?? null,
    [ingredients, selectedId]
  );

  function applyPackHelper(delta: number) {
    const current = Number(qtyInput) || 0;
    setQtyInput(String(current + delta));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError("Please select an ingredient.");
      return;
    }
    const qty = Number(qtyInput);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid quantity greater than 0.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let reportedPaidCents: number | undefined = undefined;
      if (mode === "RESTOCK" && totalPaidPesos.trim()) {
        const p = Number(totalPaidPesos);
        if (isNaN(p) || p < 0) {
          throw new Error("Total paid must be a valid non-negative number.");
        }
        reportedPaidCents = Math.round(p * 100);
      }

      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: selectedId,
          reason: mode,
          qty,
          reportedPaidCents,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Request failed (${res.status})`);
      }

      const ingName = selectedIngredient?.name ?? "Ingredient";
      const unit = selectedIngredient?.unit ?? "";
      setSuccessMsg(
        mode === "RESTOCK"
          ? `✓ Restocked +${qty} ${unit} of ${ingName}.`
          : `✓ Recorded waste of ${qty} ${unit} of ${ingName}.`
      );

      setQtyInput("");
      setTotalPaidPesos("");
      setNote("");
      await loadIngredients();
      onMovementRecorded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-foam p-6 shadow-xl border border-roast/20 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-roast/10 pb-3">
          <h3 className="text-lg font-bold text-espresso">📦 Quick Stock Actions</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-roast hover:bg-latte/20 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector */}
        <div className="mt-4 flex rounded-full border border-roast/20 bg-cream p-1">
          <button
            type="button"
            onClick={() => { setMode("RESTOCK"); setError(null); }}
            className={
              "flex-1 rounded-full py-2 text-xs sm:text-sm font-bold transition-all min-h-[38px] " +
              (mode === "RESTOCK"
                ? "bg-espresso text-foam shadow-xs"
                : "text-roast hover:bg-latte/20")
            }
          >
            ⚡ Restock Item
          </button>
          <button
            type="button"
            onClick={() => { setMode("WASTE"); setError(null); }}
            className={
              "flex-1 rounded-full py-2 text-xs sm:text-sm font-bold transition-all min-h-[38px] " +
              (mode === "WASTE"
                ? "bg-red-700 text-foam shadow-xs"
                : "text-roast hover:bg-latte/20")
            }
          >
            🗑 Record Waste
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>
        )}
        {successMsg && (
          <p className="mt-3 rounded-xl bg-green-50 p-3 text-xs font-bold text-green-800">{successMsg}</p>
        )}

        {loading && ingredients.length === 0 ? (
          <p className="mt-6 text-center text-sm text-roast animate-pulse">Loading ingredients…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Ingredient Select */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">
                Select Ingredient
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-sm text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              >
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} (Current: {ing.stockQty} {ing.unit})
                    {ing.isOutOfStock ? " — OUT OF STOCK" : ing.isLowStock ? " — LOW" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Stock Banner */}
            {selectedIngredient && (
              <div className="flex items-center justify-between rounded-xl bg-cream/70 p-3 text-xs border border-roast/10">
                <span className="font-semibold text-roast">Current Stock:</span>
                <span className="font-mono font-bold text-espresso">
                  {selectedIngredient.stockQty} {selectedIngredient.unit}
                </span>
              </div>
            )}

            {/* Quick Pack Helper buttons */}
            {selectedIngredient && (
              <div>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-roast">
                  Quick Pack Add
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedIngredient.unit === "G" && (
                    <>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(250)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +250g
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(500)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +500g
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(1000)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +1,000g (1kg)
                      </button>
                    </>
                  )}
                  {selectedIngredient.unit === "ML" && (
                    <>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(500)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +500ml
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(1000)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +1,000ml (1L)
                      </button>
                    </>
                  )}
                  {selectedIngredient.unit === "PC" && (
                    <>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(1)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +1 pc
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(6)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +6 pcs (Half Dozen)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPackHelper(12)}
                        className="rounded-full border border-roast/20 bg-foam px-3 py-1.5 text-xs font-bold text-espresso hover:bg-cream"
                      >
                        +12 pcs (Dozen)
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Quantity Input */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">
                {mode === "RESTOCK" ? "Restock Quantity" : "Waste Quantity"}{" "}
                {selectedIngredient ? `(${selectedIngredient.unit})` : ""}
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                placeholder="e.g. 1000"
                className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-sm text-espresso font-mono focus:border-espresso focus:outline-none min-h-[44px]"
              />
            </div>

            {/* Total Paid (Restock only) */}
            {mode === "RESTOCK" && (
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">
                  Total Paid (₱) <span className="font-normal text-latte">(Optional)</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-roast/50">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalPaidPesos}
                    onChange={(e) => setTotalPaidPesos(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-roast/20 bg-cream pl-8 pr-3.5 py-2.5 text-base sm:text-sm text-espresso font-mono focus:border-espresso focus:outline-none min-h-[44px]"
                  />
                </div>
                <p className="mt-1 text-[11px] italic text-roast">
                  * Sent to admin for price confirmation before updating unit costs.
                </p>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-roast">
                Note / Reason <span className="font-normal text-latte">(Optional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === "RESTOCK" ? "e.g. Bought from Metro Supermarket" : "e.g. Spilled milk during rush"}
                className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-sm text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className={
                  "flex min-h-[48px] w-full items-center justify-center rounded-full text-sm font-bold text-foam shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 " +
                  (mode === "RESTOCK" ? "bg-espresso" : "bg-red-700")
                }
              >
                {submitting
                  ? "Saving…"
                  : mode === "RESTOCK"
                  ? "Confirm Restock"
                  : "Record Waste"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
