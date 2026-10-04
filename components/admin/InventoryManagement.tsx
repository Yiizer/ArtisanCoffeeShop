"use client";

import { useEffect, useState, useCallback } from "react";
import { formatPesos } from "@/lib/format";
import type { AdminIngredient, PendingCostReview, AdminStockMovement, IngredientUnit } from "./types";

export default function InventoryManagement() {
  const [ingredients, setIngredients] = useState<AdminIngredient[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingCostReview[]>([]);
  const [movements, setMovements] = useState<AdminStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconcileResult, setReconcileResult] = useState<{ reconciled: boolean; discrepancies: any[] } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState<AdminIngredient | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState<AdminIngredient | null>(null);
  const [showEditModal, setShowEditModal] = useState<AdminIngredient | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [customCostPesos, setCustomCostPesos] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [ingRes, revRes] = await Promise.all([
        fetch("/api/admin/ingredients?includeArchived=true"),
        fetch("/api/admin/movements/pending"),
      ]);

      if (!ingRes.ok) throw new Error("Failed to load ingredients.");
      if (!revRes.ok) throw new Error("Failed to load pending reviews.");

      const ingData = await ingRes.json();
      const revData = await revRes.json();

      setIngredients(ingData);
      setPendingReviews(revData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMovements = async () => {
    try {
      const res = await fetch("/api/admin/movements?limit=100");
      if (res.ok) {
        const data = await res.json();
        setMovements(data);
        setShowHistoryModal(true);
      }
    } catch {
      // ignore
    }
  };

  const handleReconcile = async () => {
    try {
      const res = await fetch("/api/admin/inventory/reconcile");
      if (res.ok) {
        const data = await res.json();
        setReconcileResult(data);
      }
    } catch {
      // ignore
    }
  };

  const handleReviewAction = async (movementId: string, action: "confirm" | "dismiss", customCostCents?: number) => {
    try {
      const res = await fetch(`/api/admin/movements/${movementId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          editUnitCostCents: customCostCents,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Review action failed");
      }
      setEditingReviewId(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleArchiveToggle = async (ing: AdminIngredient) => {
    const isArchived = !!ing.archivedAt;
    try {
      const res = await fetch(`/api/admin/ingredients/${ing.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unarchive: isArchived }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Archive action failed");
      }
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to change archive status");
    }
  };

  const lowStockCount = ingredients.filter((i) => !i.archivedAt && (i.isLowStock || i.isOutOfStock)).length;

  return (
    <div className="space-y-6">
      {/* Top Banner Alert if low stock exists */}
      {lowStockCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200 text-amber-800 font-bold">
              !
            </span>
            <div>
              <p className="font-semibold text-sm">Low Stock Alert</p>
              <p className="text-xs text-amber-800">
                {lowStockCount} {lowStockCount === 1 ? "ingredient has" : "ingredients have"} reached or fallen below threshold.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header with Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-espresso">Inventory & Recipe Ingredients</h2>
          <p className="text-xs text-roast">Track real-time stock levels, unit costs, and review pending restock prices.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-xl bg-espresso px-4 py-2 text-xs sm:text-sm font-semibold text-foam shadow-sm hover:opacity-90 transition active:scale-95"
          >
            + Add Ingredient
          </button>
          <button
            type="button"
            onClick={loadMovements}
            className="rounded-xl border border-roast/20 bg-foam px-3 py-2 text-xs sm:text-sm font-semibold text-espresso hover:bg-cream transition"
          >
            Movement History
          </button>
          <button
            type="button"
            onClick={handleReconcile}
            className="rounded-xl border border-roast/20 bg-foam px-3 py-2 text-xs sm:text-sm font-semibold text-roast hover:bg-cream transition"
          >
            Reconcile Check
          </button>
        </div>
      </div>

      {reconcileResult && (
        <div className={`p-4 rounded-xl text-xs ${reconcileResult.reconciled ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          <div className="flex justify-between items-center">
            <span className="font-bold">
              {reconcileResult.reconciled ? "✓ Reconcile check passed: Stock quantities match ledger movements exactly (0 drift)." : "⚠ Drift detected in inventory ledger!"}
            </span>
            <button onClick={() => setReconcileResult(null)} className="underline font-medium">Close</button>
          </div>
        </div>
      )}

      {/* Pending Prices Review Queue */}
      {pendingReviews.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-foam text-xs font-bold">
                {pendingReviews.length}
              </span>
              <h3 className="font-bold text-sm text-espresso">Pending Price Confirmations</h3>
            </div>
            <span className="text-xs text-roast">Staff reported restock prices needing admin review</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-amber-200/60 text-roast uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Ingredient</th>
                  <th className="py-2 px-3">Restock Qty</th>
                  <th className="py-2 px-3">Reported Total</th>
                  <th className="py-2 px-3">Reported Unit Cost</th>
                  <th className="py-2 px-3">Current Cost</th>
                  <th className="py-2 px-3">Difference</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/40">
                {pendingReviews.map((rev) => {
                  const repCostCents = Number(rev.reportedUnitCostCents);
                  const currCostCents = rev.currentUnitCostCents ? Number(rev.currentUnitCostCents) : null;
                  const isHighDeviation = rev.pctChange !== null && Math.abs(rev.pctChange) >= 50;

                  return (
                    <tr key={rev.movementId} className="hover:bg-amber-100/40">
                      <td className="py-2.5 px-3 text-roast">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-espresso">
                        {rev.ingredientName}
                      </td>
                      <td className="py-2.5 px-3">
                        {rev.qty} {rev.unit}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        {rev.reportedPaidCents ? formatPesos(rev.reportedPaidCents) : "—"}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-espresso">
                        {formatPesos(Math.round(repCostCents))} / {rev.unit}
                      </td>
                      <td className="py-2.5 px-3 text-roast">
                        {currCostCents !== null ? `${formatPesos(Math.round(currCostCents))} / ${rev.unit}` : "No cost"}
                      </td>
                      <td className="py-2.5 px-3">
                        {rev.pctChange !== null ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isHighDeviation ? "bg-red-100 text-red-700 font-extrabold border border-red-300" : "bg-roast/10 text-roast"
                            }`}
                          >
                            {rev.pctChange > 0 ? `+${rev.pctChange.toFixed(1)}%` : `${rev.pctChange.toFixed(1)}%`}
                            {isHighDeviation && " (±50%!)"}
                          </span>
                        ) : (
                          <span className="text-latte">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        {editingReviewId === rev.movementId ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="₱/unit"
                              value={customCostPesos}
                              onChange={(e) => setCustomCostPesos(e.target.value)}
                              className="w-20 rounded border border-roast/20 bg-foam px-1.5 py-0.5 text-xs text-espresso"
                            />
                            <button
                              onClick={() => {
                                const cents = Math.round(Number(customCostPesos) * 100);
                                if (!isNaN(cents) && cents >= 0) {
                                  handleReviewAction(rev.movementId, "confirm", cents);
                                }
                              }}
                              className="rounded bg-espresso px-2 py-0.5 text-[10px] font-bold text-foam hover:opacity-90"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingReviewId(null)}
                              className="text-[10px] text-roast underline"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReviewAction(rev.movementId, "confirm")}
                              className="rounded-lg bg-green-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-green-800"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReviewId(rev.movementId);
                                setCustomCostPesos((repCostCents / 100).toFixed(2));
                              }}
                              className="rounded-lg border border-roast/20 bg-foam px-2 py-1 text-xs font-semibold text-espresso hover:bg-cream"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewAction(rev.movementId, "dismiss")}
                              className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ingredients Inventory Table */}
      <div className="overflow-hidden rounded-2xl border border-roast/15 bg-foam shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-roast/10 bg-cream/50 text-[11px] font-bold uppercase tracking-wider text-roast">
              <tr>
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4">Stock Level</th>
                <th className="py-3 px-4">Unit Cost</th>
                <th className="py-3 px-4">Low Threshold</th>
                <th className="py-3 px-4">Cost Updated</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-roast/10 text-espresso">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-roast">
                    Loading inventory...
                  </td>
                </tr>
              ) : ingredients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-roast">
                    No ingredients created yet. Click "+ Add Ingredient" above to get started.
                  </td>
                </tr>
              ) : (
                ingredients.map((ing) => {
                  const isArchived = !!ing.archivedAt;
                  const unitCost = ing.unitCostCents ? Number(ing.unitCostCents) : null;
                  const stockNum = Number(ing.stockQty);

                  return (
                    <tr
                      key={ing.id}
                      className={`hover:bg-cream/40 transition ${isArchived ? "opacity-50 bg-roast/5" : ""}`}
                    >
                      <td className="py-3 px-4 font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{ing.name}</span>
                          {isArchived && (
                            <span className="rounded-full bg-roast/20 px-2 py-0.5 text-[10px] text-roast font-bold">
                              Archived
                            </span>
                          )}
                          {ing.isOutOfStock && !isArchived && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              Out of stock
                            </span>
                          )}
                          {ing.isLowStock && !ing.isOutOfStock && !isArchived && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              Low stock
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-roast">{ing.unit}</td>
                      <td className="py-3 px-4 font-mono font-medium">
                        <span
                          className={
                            stockNum <= 0
                              ? "text-red-600 font-bold"
                              : ing.isLowStock
                              ? "text-amber-700 font-bold"
                              : "text-espresso"
                          }
                        >
                          {ing.stockQty} {ing.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {unitCost !== null ? (
                          <span>
                            {formatPesos(Math.round(unitCost))} / {ing.unit}
                          </span>
                        ) : (
                          <span className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            No cost
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-roast font-mono">
                        {ing.lowStockThreshold} {ing.unit}
                      </td>
                      <td className="py-3 px-4 text-xs text-roast">
                        {ing.costUpdatedAt ? new Date(ing.costUpdatedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1 sm:space-x-2">
                        <button
                          type="button"
                          onClick={() => setShowRestockModal(ing)}
                          className="rounded-lg border border-roast/20 bg-foam px-2.5 py-1 text-xs font-semibold text-espresso hover:bg-cream"
                        >
                          Restock
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAdjustModal(ing)}
                          className="rounded-lg border border-roast/20 bg-foam px-2 py-1 text-xs font-semibold text-roast hover:bg-cream"
                        >
                          Adjust
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowEditModal(ing)}
                          className="rounded-lg border border-roast/20 bg-foam px-2 py-1 text-xs font-semibold text-roast hover:bg-cream"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveToggle(ing)}
                          className="rounded-lg border border-roast/20 px-2 py-1 text-xs font-semibold text-roast hover:bg-red-50 hover:text-red-700"
                        >
                          {isArchived ? "Unarchive" : "Archive"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Ingredient Modal */}
      {showAddModal && (
        <AddIngredientModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchData();
          }}
        />
      )}

      {/* Restock Modal */}
      {showRestockModal && (
        <RestockModal
          ingredient={showRestockModal}
          onClose={() => setShowRestockModal(null)}
          onSuccess={() => {
            setShowRestockModal(null);
            fetchData();
          }}
        />
      )}

      {/* Adjust Modal */}
      {showAdjustModal && (
        <AdjustModal
          ingredient={showAdjustModal}
          onClose={() => setShowAdjustModal(null)}
          onSuccess={() => {
            setShowAdjustModal(null);
            fetchData();
          }}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditIngredientModal
          ingredient={showEditModal}
          onClose={() => setShowEditModal(null)}
          onSuccess={() => {
            setShowEditModal(null);
            fetchData();
          }}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-foam p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-espresso text-base">Recent Stock Movements</h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-roast font-bold">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-roast/10 text-roast uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Ingredient</th>
                    <th className="py-2 px-3">Reason</th>
                    <th className="py-2 px-3">Change</th>
                    <th className="py-2 px-3">Unit Cost</th>
                    <th className="py-2 px-3">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-roast/10">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 px-3">{new Date(m.createdAt).toLocaleString()}</td>
                      <td className="py-2 px-3 font-semibold">{m.ingredient.name}</td>
                      <td className="py-2 px-3">
                        <span className="rounded bg-cream px-1.5 py-0.5 text-[10px] font-bold text-roast">
                          {m.reason}
                        </span>
                      </td>
                      <td className={`py-2 px-3 font-mono font-bold ${Number(m.qtyChange) > 0 ? "text-green-700" : "text-red-700"}`}>
                        {Number(m.qtyChange) > 0 ? `+${m.qtyChange}` : m.qtyChange} {m.ingredient.unit}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {m.unitCostCents ? `${formatPesos(Math.round(Number(m.unitCostCents)))}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-roast">{m.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Submodal: Add Ingredient
function AddIngredientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<IngredientUnit>("G");
  const [lowStockThreshold, setLowStockThreshold] = useState("0");
  const [initialStock, setInitialStock] = useState("");
  const [initialCostPesos, setInitialCostPesos] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter an ingredient name.");
    setLoading(true);
    setError(null);

    try {
      const unitCostCents = initialCostPesos ? Math.round(Number(initialCostPesos) * 100) : null;
      const res = await fetch("/api/admin/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          unit,
          lowStockThreshold: Number(lowStockThreshold) || 0,
          initialStock: initialStock ? Number(initialStock) : undefined,
          unitCostCents,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create ingredient");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ingredient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-foam p-6 shadow-2xl border border-roast/20">
        <h3 className="font-bold text-espresso text-base mb-4">Add New Ingredient</h3>
        {error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-roast block mb-1">Name</label>
            <input
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Espresso Beans, Fresh Milk"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-roast block mb-1">Unit</label>
              <select
                className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
                value={unit}
                onChange={(e) => setUnit(e.target.value as IngredientUnit)}
              >
                <option value="G">Grams (G)</option>
                <option value="ML">Milliliters (ML)</option>
                <option value="PC">Pieces (PC)</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-roast block mb-1">Low-Stock Alert Qty</label>
              <input
                type="number"
                step="any"
                className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-roast block mb-1">Opening Stock (Optional)</label>
              <input
                type="number"
                step="any"
                className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="font-semibold text-roast block mb-1">Unit Cost ₱ (Optional)</label>
              <input
                type="number"
                step="0.0001"
                className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
                value={initialCostPesos}
                onChange={(e) => setInitialCostPesos(e.target.value)}
                placeholder="₱0.00"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-roast/20 px-4 py-2 font-semibold text-roast hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-espresso px-4 py-2 font-semibold text-foam hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Submodal: Restock
function RestockModal({
  ingredient,
  onClose,
  onSuccess,
}: {
  ingredient: AdminIngredient;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [qty, setQty] = useState("");
  const [totalPaidPesos, setTotalPaidPesos] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) return setError("Please enter a quantity > 0.");
    setLoading(true);
    setError(null);

    try {
      const totalPaidCents = totalPaidPesos ? Math.round(Number(totalPaidPesos) * 100) : undefined;
      const res = await fetch(`/api/admin/ingredients/${ingredient.id}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "RESTOCK",
          qty: Number(qty),
          totalPaidCents,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Restock failed");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restock failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-foam p-6 shadow-2xl border border-roast/20">
        <h3 className="font-bold text-espresso text-base mb-1">Restock {ingredient.name}</h3>
        <p className="text-xs text-roast mb-4">Adds stock and updates unit cost from last purchase price.</p>
        {error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-roast block mb-1">Quantity to Add ({ingredient.unit})</label>
            <input
              type="number"
              step="any"
              min="0.001"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`e.g. 1000 ${ingredient.unit}`}
              required
            />
          </div>
          <div>
            <label className="font-semibold text-roast block mb-1">Total Paid (₱) - Optional</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={totalPaidPesos}
              onChange={(e) => setTotalPaidPesos(e.target.value)}
              placeholder="e.g. ₱450.00"
            />
            <span className="text-[10px] text-roast">Updates unit cost to Total Paid ÷ Qty</span>
          </div>
          <div>
            <label className="font-semibold text-roast block mb-1">Note (Optional)</label>
            <input
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Purchased from Supplier X"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-roast/20 px-4 py-2 font-semibold text-roast hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-espresso px-4 py-2 font-semibold text-foam hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Add Stock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Submodal: Adjust / Waste
function AdjustModal({
  ingredient,
  onClose,
  onSuccess,
}: {
  ingredient: AdminIngredient;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState<"ADJUSTMENT" | "WASTE">("ADJUSTMENT");
  const [qtyChange, setQtyChange] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(qtyChange);
    if (!qtyChange || isNaN(n) || n === 0) return setError("Please enter a non-zero quantity change.");
    if (reason === "WASTE" && n > 0) return setError("Waste quantity must be negative (reducing stock).");

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/ingredients/${ingredient.id}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          qtyChange: n,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Adjustment failed");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-foam p-6 shadow-2xl border border-roast/20">
        <h3 className="font-bold text-espresso text-base mb-1">Record Stock Correction / Waste</h3>
        <p className="text-xs text-roast mb-4">{ingredient.name} · Current: {ingredient.stockQty} {ingredient.unit}</p>
        {error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-roast block mb-1">Reason</label>
            <select
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
            >
              <option value="ADJUSTMENT">Count Correction (Stock Adjustment)</option>
              <option value="WASTE">Damaged / Expired / Spilled (Waste)</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-roast block mb-1">
              Quantity Change ({ingredient.unit})
            </label>
            <input
              type="number"
              step="any"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={qtyChange}
              onChange={(e) => setQtyChange(e.target.value)}
              placeholder={reason === "WASTE" ? "-50" : "+10 or -10"}
              required
            />
            <span className="text-[10px] text-roast">
              {reason === "WASTE" ? "Enter negative number (e.g. -50 to write off 50)." : "Positive for found stock, negative for shrinkage."}
            </span>
          </div>
          <div>
            <label className="font-semibold text-roast block mb-1">Reason / Note</label>
            <input
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. End-of-week physical count audit"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-roast/20 px-4 py-2 font-semibold text-roast hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-espresso px-4 py-2 font-semibold text-foam hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Recording..." : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Submodal: Edit Ingredient
function EditIngredientModal({
  ingredient,
  onClose,
  onSuccess,
}: {
  ingredient: AdminIngredient;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(ingredient.name);
  const [lowStockThreshold, setLowStockThreshold] = useState(ingredient.lowStockThreshold);
  const [unitCostPesos, setUnitCostPesos] = useState(
    ingredient.unitCostCents ? (Number(ingredient.unitCostCents) / 100).toFixed(4) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const unitCostCents = unitCostPesos ? Math.round(Number(unitCostPesos) * 10000) / 100 : null;
      const res = await fetch(`/api/admin/ingredients/${ingredient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          lowStockThreshold: Number(lowStockThreshold),
          unitCostCents,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Update failed");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-foam p-6 shadow-2xl border border-roast/20">
        <h3 className="font-bold text-espresso text-base mb-4">Edit Ingredient</h3>
        {error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-roast block mb-1">Name</label>
            <input
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="font-semibold text-roast block mb-1">Low-Stock Alert Threshold ({ingredient.unit})</label>
            <input
              type="number"
              step="any"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="font-semibold text-roast block mb-1">Unit Cost ₱ (per {ingredient.unit})</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso"
              value={unitCostPesos}
              onChange={(e) => setUnitCostPesos(e.target.value)}
              placeholder="Leave empty for unknown / uncosted"
            />
            <span className="text-[10px] text-roast">Leave blank to mark as "No cost"</span>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-roast/20 px-4 py-2 font-semibold text-roast hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-espresso px-4 py-2 font-semibold text-foam hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
