"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatPesos } from "@/lib/format";
import type { AdminIngredient, PendingCostReview, AdminStockMovement, IngredientUnit } from "./types";

export default function InventoryManagement() {
  const [ingredients, setIngredients] = useState<AdminIngredient[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingCostReview[]>([]);
  const [movements, setMovements] = useState<AdminStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconcileResult, setReconcileResult] = useState<{ reconciled: boolean; discrepancies: any[] } | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "low" | "archived">("all");

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

  const lowStockCount = useMemo(
    () => ingredients.filter((i) => !i.archivedAt && (i.isLowStock || i.isOutOfStock)).length,
    [ingredients]
  );
  const archivedCount = useMemo(
    () => ingredients.filter((i) => !!i.archivedAt).length,
    [ingredients]
  );
  const activeCount = useMemo(
    () => ingredients.filter((i) => !i.archivedAt).length,
    [ingredients]
  );

  const filteredIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      const isArchived = !!ing.archivedAt;
      if (activeFilter === "low" && (isArchived || (!ing.isLowStock && !ing.isOutOfStock))) return false;
      if (activeFilter === "archived" && !isArchived) return false;
      if (activeFilter === "all" && isArchived) return false; // Default 'all' shows active items
      if (!searchQuery.trim()) return true;
      return ing.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    });
  }, [ingredients, activeFilter, searchQuery]);

  return (
    <div className="space-y-4 sm:space-y-6 text-espresso">
      {/* Top Banner Alert if low stock exists */}
      {lowStockCount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 sm:p-4 text-amber-900 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-black text-sm shrink-0">
              ⚠️
            </span>
            <div>
              <p className="font-bold text-xs sm:text-sm">Low Stock Alert</p>
              <p className="text-[11px] sm:text-xs text-amber-800">
                {lowStockCount} {lowStockCount === 1 ? "ingredient needs" : "ingredients need"} restock.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveFilter("low")}
            className="rounded-full bg-amber-200/80 hover:bg-amber-300 px-3 py-1 text-xs font-bold text-amber-900 shrink-0 transition"
          >
            View
          </button>
        </div>
      )}

      {/* Header with Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-roast/10 pb-3 sm:pb-4">
        <div>
          <span className="text-[0.65rem] font-bold tracking-[0.22em] uppercase text-roast block">
            Inventory & Recipes
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Ingredients Ledger
          </h2>
          <p className="text-xs text-roast mt-0.5">
            {activeCount} active ingredients · {lowStockCount} low stock
          </p>
        </div>

        {/* Action Buttons Row (Mobile Thumb Friendly) */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-initial rounded-full bg-espresso px-4 py-2.5 text-xs sm:text-sm font-bold text-foam shadow-sm hover:opacity-90 transition active:scale-95 text-center min-h-[40px] flex items-center justify-center gap-1.5"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>Add Ingredient</span>
          </button>
          <button
            type="button"
            onClick={loadMovements}
            className="rounded-full border border-roast/20 bg-foam px-3.5 py-2.5 text-xs font-bold text-espresso hover:bg-cream transition active:scale-95 min-h-[40px]"
          >
            History
          </button>
          <button
            type="button"
            onClick={handleReconcile}
            className="rounded-full border border-roast/20 bg-foam px-3.5 py-2.5 text-xs font-bold text-roast hover:bg-cream transition active:scale-95 min-h-[40px]"
          >
            Audit
          </button>
        </div>
      </div>

      {reconcileResult && (
        <div className={`p-3.5 rounded-2xl text-xs ${reconcileResult.reconciled ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          <div className="flex justify-between items-center gap-2">
            <span className="font-bold">
              {reconcileResult.reconciled ? "✓ Reconcile passed: Stock matches ledger movements (0 drift)." : "⚠ Drift detected in inventory ledger!"}
            </span>
            <button onClick={() => setReconcileResult(null)} className="underline font-bold text-xs p-1">Close</button>
          </div>
        </div>
      )}

      {/* Search Input & Quick Filter Pills */}
      <div className="space-y-2">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-roast/60 text-xs">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search ingredients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-roast/20 bg-foam pl-9 pr-9 py-2.5 text-base sm:text-xs font-semibold text-espresso placeholder-roast/40 focus:border-espresso focus:outline-none min-h-[44px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-bold text-roast hover:text-espresso"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills (Smooth swipe on mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 active:scale-95 min-h-[34px] " +
              (activeFilter === "all"
                ? "bg-espresso text-foam shadow-2xs"
                : "bg-foam text-roast border border-roast/15 hover:bg-latte/30")
            }
          >
            All Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("low")}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 active:scale-95 min-h-[34px] " +
              (activeFilter === "low"
                ? "bg-amber-600 text-foam shadow-2xs"
                : "bg-foam text-amber-800 border border-amber-300 hover:bg-amber-50")
            }
          >
            Low Stock ({lowStockCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("archived")}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 active:scale-95 min-h-[34px] " +
              (activeFilter === "archived"
                ? "bg-espresso text-foam shadow-2xs"
                : "bg-foam text-roast border border-roast/15 hover:bg-latte/30")
            }
          >
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      {/* Pending Prices Review Queue (Mobile Card View + Desktop Table) */}
      {pendingReviews.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-foam text-xs font-bold shrink-0">
                {pendingReviews.length}
              </span>
              <h3 className="font-bold text-xs sm:text-sm text-espresso">Pending Price Confirmations</h3>
            </div>
            <span className="text-[10px] sm:text-xs text-roast hidden sm:inline">Staff reported restock prices needing admin review</span>
          </div>

          {/* Mobile Cards for Pending Reviews (< md) */}
          <div className="md:hidden space-y-2.5">
            {pendingReviews.map((rev) => {
              const repCostCents = Number(rev.reportedUnitCostCents);
              const currCostCents = rev.currentUnitCostCents ? Number(rev.currentUnitCostCents) : null;
              const isHighDeviation = rev.pctChange !== null && Math.abs(rev.pctChange) >= 50;

              return (
                <div key={rev.movementId} className="rounded-xl border border-amber-300 bg-foam p-3 space-y-2 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-espresso">{rev.ingredientName}</h4>
                      <p className="text-[11px] text-roast">Restocked: {rev.qty} {rev.unit}</p>
                    </div>
                    {rev.pctChange !== null ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isHighDeviation ? "bg-red-100 text-red-700 border border-red-300" : "bg-amber-100 text-amber-800"
                      }`}>
                        {rev.pctChange > 0 ? `+${rev.pctChange.toFixed(1)}%` : `${rev.pctChange.toFixed(1)}%`}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-amber-50/70 rounded-lg p-2 border border-amber-200/60">
                    <div>
                      <span className="text-roast/70 text-[9px] uppercase font-bold block">Reported Paid</span>
                      <span className="font-mono font-bold text-espresso">{rev.reportedPaidCents ? formatPesos(rev.reportedPaidCents) : "—"}</span>
                    </div>
                    <div>
                      <span className="text-roast/70 text-[9px] uppercase font-bold block">New Unit Cost</span>
                      <span className="font-mono font-bold text-espresso">{formatPesos(Math.round(repCostCents))} / {rev.unit}</span>
                    </div>
                  </div>

                  {editingReviewId === rev.movementId ? (
                    <div className="space-y-2 pt-1 border-t border-amber-200">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-espresso">₱</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={customCostPesos}
                          onChange={(e) => setCustomCostPesos(e.target.value)}
                          className="flex-1 rounded-lg border border-roast/20 bg-cream p-1.5 text-xs font-mono font-bold"
                          placeholder="Custom cost"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const val = parseFloat(customCostPesos);
                            if (!isNaN(val) && val >= 0) {
                              handleReviewAction(rev.movementId, "confirm", Math.round(val * 100));
                            }
                          }}
                          className="flex-1 min-h-[36px] rounded-lg bg-green-700 text-white text-xs font-bold"
                        >
                          Save Cost
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingReviewId(null)}
                          className="min-h-[36px] rounded-lg border border-roast/20 px-3 text-xs text-roast font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleReviewAction(rev.movementId, "confirm")}
                        className="flex-1 min-h-[36px] rounded-lg bg-green-700 text-white text-xs font-bold hover:bg-green-800 active:scale-95"
                      >
                        ✓ Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReviewId(rev.movementId);
                          setCustomCostPesos((repCostCents / 100).toFixed(2));
                        }}
                        className="flex-1 min-h-[36px] rounded-lg border border-roast/20 bg-cream text-espresso text-xs font-bold hover:bg-foam active:scale-95"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewAction(rev.movementId, "dismiss")}
                        className="min-h-[36px] rounded-lg border border-red-300 text-red-700 text-xs font-bold px-3 hover:bg-red-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table for Pending Reviews (md+) */}
          <div className="hidden md:block overflow-x-auto">
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
                              step="0.0001"
                              value={customCostPesos}
                              onChange={(e) => setCustomCostPesos(e.target.value)}
                              className="w-20 rounded border border-roast/20 bg-cream p-1 text-xs"
                              placeholder="₱ cost"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = parseFloat(customCostPesos);
                                if (!isNaN(val) && val >= 0) {
                                  handleReviewAction(rev.movementId, "confirm", Math.round(val * 100));
                                }
                              }}
                              className="rounded bg-green-700 px-2 py-1 text-[10px] font-bold text-white"
                            >
                              Save
                            </button>
                            <button
                              type="button"
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

      {/* Main Ingredients Section: Mobile Card View (< md) + Desktop Table (md+) */}
      {loading ? (
        <div className="py-12 text-center text-roast font-semibold text-xs animate-pulse">
          Loading inventory items…
        </div>
      ) : ingredients.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-roast/20 bg-foam p-8 sm:p-12 text-center">
          <h3 className="text-base font-bold text-espresso">No ingredients recorded</h3>
          <p className="mt-1 text-xs text-roast">Create raw ingredients and pantry items to start tracking recipes and stock.</p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-4 rounded-full bg-espresso px-6 py-2.5 text-xs font-bold text-foam hover:opacity-90 min-h-[44px]"
          >
            + Add First Ingredient
          </button>
        </div>
      ) : filteredIngredients.length === 0 ? (
        <div className="rounded-2xl border border-roast/15 bg-foam p-8 text-center">
          <p className="text-sm font-bold text-espresso">No ingredients match "{searchQuery}"</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveFilter("all");
            }}
            className="mt-2 text-xs font-bold text-espresso underline p-2 inline-block"
          >
            Clear search & filters
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Card List (< md) */}
          <div className="md:hidden space-y-3">
            {filteredIngredients.map((ing) => {
              const isArchived = !!ing.archivedAt;
              const unitCost = ing.unitCostCents ? Number(ing.unitCostCents) : null;
              const stockNum = Number(ing.stockQty);

              return (
                <div
                  key={ing.id}
                  className={`rounded-2xl border border-roast/15 bg-foam p-4 shadow-2xs space-y-3 transition ${
                    isArchived ? "opacity-60 bg-cream/40" : ""
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base text-espresso leading-snug">{ing.name}</h4>
                        {isArchived && (
                          <span className="rounded-full bg-roast/15 px-2 py-0.5 text-[9px] text-roast font-bold uppercase tracking-wider">
                            Archived
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-roast font-medium">Unit: {ing.unit}</span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`font-mono text-base font-black ${
                          stockNum <= 0
                            ? "text-red-600"
                            : ing.isLowStock
                            ? "text-amber-700"
                            : "text-espresso"
                        }`}
                      >
                        {stockNum} {ing.unit}
                      </span>
                      {ing.isOutOfStock && !isArchived ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          Out of stock
                        </span>
                      ) : ing.isLowStock && !ing.isOutOfStock && !isArchived ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Low stock
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          In stock
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-cream/70 rounded-xl p-2.5 border border-roast/10">
                    <div>
                      <span className="text-roast/70 block text-[9px] uppercase font-bold tracking-wider">Unit Cost</span>
                      <span className="font-mono font-bold text-espresso">
                        {unitCost !== null ? `${formatPesos(Math.round(unitCost))} / ${ing.unit}` : "No cost set"}
                      </span>
                    </div>
                    <div>
                      <span className="text-roast/70 block text-[9px] uppercase font-bold tracking-wider">Min Threshold</span>
                      <span className="font-mono text-roast font-semibold">
                        {Number(ing.lowStockThreshold)} {ing.unit}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Touch Action Buttons */}
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowRestockModal(ing)}
                      className="flex-1 min-h-[38px] rounded-xl bg-espresso text-foam text-xs font-bold py-2 px-3 text-center shadow-xs active:scale-95"
                    >
                      + Restock
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdjustModal(ing)}
                      className="flex-1 min-h-[38px] rounded-xl border border-roast/20 bg-foam text-espresso text-xs font-bold py-2 px-3 text-center hover:bg-cream active:scale-95"
                    >
                      Adjust
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditModal(ing)}
                      className="min-h-[38px] rounded-xl border border-roast/20 bg-foam text-roast text-xs font-bold py-2 px-3 text-center hover:bg-cream active:scale-95"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(ing)}
                      className="min-h-[38px] rounded-xl border border-roast/15 px-2.5 py-2 text-[11px] text-roast hover:text-red-700"
                    >
                      {isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (md+) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-roast/15 bg-foam shadow-sm">
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
                  {filteredIngredients.map((ing) => {
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
                            {stockNum} {ing.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {unitCost !== null ? (
                            <span className="font-semibold text-espresso">
                              {formatPesos(Math.round(unitCost))} / {ing.unit}
                            </span>
                          ) : (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 font-medium">
                              No cost
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-roast">
                          {Number(ing.lowStockThreshold)} {ing.unit}
                        </td>
                        <td className="py-3 px-4 text-xs text-roast">
                          {ing.costUpdatedAt ? new Date(ing.costUpdatedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setShowRestockModal(ing)}
                            className="rounded-lg bg-espresso px-2.5 py-1 text-xs font-semibold text-foam hover:opacity-90 transition active:scale-95"
                          >
                            Restock
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowAdjustModal(ing)}
                            className="rounded-lg border border-roast/20 bg-foam px-2.5 py-1 text-xs font-semibold text-espresso hover:bg-cream transition"
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEditModal(ing)}
                            className="rounded-lg border border-roast/20 bg-foam px-2.5 py-1 text-xs font-semibold text-roast hover:bg-cream transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchiveToggle(ing)}
                            className="rounded-lg border border-roast/20 px-2 py-1 text-xs font-medium text-roast hover:text-red-700"
                          >
                            {isArchived ? "Unarchive" : "Archive"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Submodals with mobile bottom-sheet styling */}
      {showAddModal && (
        <AddIngredientModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchData();
          }}
        />
      )}

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-espresso/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-3xl max-h-[92vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl bg-foam p-4 sm:p-6 shadow-2xl overflow-hidden flex flex-col border border-roast/20">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-roast/10">
              <h3 className="font-bold text-espresso text-base">Recent Stock Movements</h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-roast font-bold text-sm p-1">✕</button>
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
                    <th className="py-2 px-3 text-roast">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-roast/10">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 px-3 text-roast">{new Date(m.createdAt).toLocaleDateString()}</td>
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

// Submodal: Add Ingredient (Mobile Bottom-Sheet / Desktop Centered)
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-espresso/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl bg-foam p-5 sm:p-6 shadow-2xl border border-roast/20 overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-roast/10 mb-4">
          <h3 className="font-bold text-espresso text-base">Add New Ingredient</h3>
          <button type="button" onClick={onClose} className="text-roast font-bold text-sm p-1">✕</button>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 font-bold">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Name</label>
            <input
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Espresso Beans, Fresh Milk"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Unit</label>
              <select
                className="w-full rounded-xl border border-roast/20 bg-cream px-3 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
                value={unit}
                onChange={(e) => setUnit(e.target.value as IngredientUnit)}
              >
                <option value="G">Grams (G)</option>
                <option value="ML">Milliliters (ML)</option>
                <option value="PC">Pieces (PC)</option>
              </select>
            </div>
            <div>
              <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Low-Stock Alert</label>
              <input
                type="number"
                step="any"
                className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Initial Stock (Opt)</label>
              <input
                type="number"
                step="any"
                className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Unit Cost ₱ (Opt)</label>
              <input
                type="number"
                step="0.0001"
                className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
                value={initialCostPesos}
                onChange={(e) => setInitialCostPesos(e.target.value)}
                placeholder="₱0.00"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-roast/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial rounded-xl border border-roast/20 px-4 py-2.5 font-bold text-roast hover:bg-cream min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial rounded-xl bg-espresso px-5 py-2.5 font-bold text-foam hover:opacity-90 disabled:opacity-50 min-h-[44px]"
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-espresso/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl bg-foam p-5 sm:p-6 shadow-2xl border border-roast/20 overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-roast/10 mb-3">
          <div>
            <h3 className="font-bold text-espresso text-base">Restock {ingredient.name}</h3>
            <p className="text-[11px] text-roast">Current Stock: {ingredient.stockQty} {ingredient.unit}</p>
          </div>
          <button type="button" onClick={onClose} className="text-roast font-bold text-sm p-1">✕</button>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 font-bold">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">
              Quantity to Add ({ingredient.unit})
            </label>
            <input
              type="number"
              step="any"
              min="0.001"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`e.g. 1000 ${ingredient.unit}`}
              required
            />
          </div>
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">
              Total Paid ₱ (Optional)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={totalPaidPesos}
              onChange={(e) => setTotalPaidPesos(e.target.value)}
              placeholder="e.g. 450.00"
            />
            <span className="text-[10px] text-roast block mt-1">Updates unit cost to Total Paid ÷ Qty</span>
          </div>
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Note (Optional)</label>
            <input
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Storefront Restock"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-roast/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial rounded-xl border border-roast/20 px-4 py-2.5 font-bold text-roast hover:bg-cream min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial rounded-xl bg-espresso px-5 py-2.5 font-bold text-foam hover:opacity-90 disabled:opacity-50 min-h-[44px]"
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-espresso/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl bg-foam p-5 sm:p-6 shadow-2xl border border-roast/20 overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-roast/10 mb-3">
          <div>
            <h3 className="font-bold text-espresso text-base">Record Adjustment / Waste</h3>
            <p className="text-[11px] text-roast">{ingredient.name} · Current: {ingredient.stockQty} {ingredient.unit}</p>
          </div>
          <button type="button" onClick={onClose} className="text-roast font-bold text-sm p-1">✕</button>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 font-bold">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Reason</label>
            <select
              className="w-full rounded-xl border border-roast/20 bg-cream px-3 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
            >
              <option value="ADJUSTMENT">Count Correction (Stock Adjustment)</option>
              <option value="WASTE">Damaged / Expired / Spilled (Waste)</option>
            </select>
          </div>
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">
              Quantity Change ({ingredient.unit})
            </label>
            <input
              type="number"
              step="any"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={qtyChange}
              onChange={(e) => setQtyChange(e.target.value)}
              placeholder={reason === "WASTE" ? "-50" : "+10 or -10"}
              required
            />
            <span className="text-[10px] text-roast block mt-1">
              {reason === "WASTE" ? "Enter negative number (e.g. -50 to write off)." : "Positive for found stock, negative for shrinkage."}
            </span>
          </div>
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Reason / Note</label>
            <input
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. End-of-week inventory audit"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-roast/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial rounded-xl border border-roast/20 px-4 py-2.5 font-bold text-roast hover:bg-cream min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial rounded-xl bg-espresso px-5 py-2.5 font-bold text-foam hover:opacity-90 disabled:opacity-50 min-h-[44px]"
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-espresso/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl bg-foam p-5 sm:p-6 shadow-2xl border border-roast/20 overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-roast/10 mb-4">
          <h3 className="font-bold text-espresso text-base">Edit Ingredient</h3>
          <button type="button" onClick={onClose} className="text-roast font-bold text-sm p-1">✕</button>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 font-bold">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Name</label>
            <input
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">
              Low-Stock Alert Threshold ({ingredient.unit})
            </label>
            <input
              type="number"
              step="any"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">
              Unit Cost ₱ (per {ingredient.unit})
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3.5 py-2.5 text-base sm:text-xs text-espresso focus:border-espresso focus:outline-none min-h-[44px]"
              value={unitCostPesos}
              onChange={(e) => setUnitCostPesos(e.target.value)}
              placeholder="Leave empty for uncosted"
            />
            <span className="text-[10px] text-roast block mt-1">Leave blank to mark as uncosted</span>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-roast/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial rounded-xl border border-roast/20 px-4 py-2.5 font-bold text-roast hover:bg-cream min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial rounded-xl bg-espresso px-5 py-2.5 font-bold text-foam hover:opacity-90 disabled:opacity-50 min-h-[44px]"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
