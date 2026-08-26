"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPesos } from "@/lib/format";
import ItemFormModal from "./ItemFormModal";
import DeleteConfirmModal from "./DeleteConfirmModal";
import type { ItemDraft } from "./ItemForm";
import type { AdminMenuItem } from "./types";

const emptyDraft = (): ItemDraft => ({
  name: "",
  description: "",
  category: "",
  basePricePesos: "",
  available: true,
  sizes: [],
  addOns: [],
});

function pesosToCents(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToPesosInput(c: number): string {
  return (c / 100).toFixed(2);
}

function draftFromItem(item: AdminMenuItem): ItemDraft {
  return {
    name: item.name,
    description: item.description ?? "",
    category: item.category,
    basePricePesos: centsToPesosInput(item.basePriceCents),
    available: item.available,
    sizes: item.sizes.map((s) => ({
      name: s.name,
      priceDeltaPesos: centsToPesosInput(s.priceDeltaCents),
    })),
    addOns: item.addOns.map((a) => ({
      name: a.name,
      pricePesos: centsToPesosInput(a.priceCents),
      available: a.available,
    })),
  };
}

function draftToPayload(d: ItemDraft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || undefined,
    category: d.category.trim(),
    basePriceCents: pesosToCents(d.basePricePesos),
    available: d.available,
    sizes: d.sizes.map((s) => ({
      name: s.name.trim(),
      priceDeltaCents: pesosToCents(s.priceDeltaPesos),
    })),
    addOns: d.addOns.map((a) => ({
      name: a.name.trim(),
      priceCents: pesosToCents(a.pricePesos),
      available: a.available,
    })),
  };
}

export default function MenuManagement() {
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<AdminMenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((c) => (c === msg ? null : c)), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) throw new Error(`Failed to load menu (${res.status}).`);
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Create Item
  const handleCreate = useCallback(
    async (draft: ItemDraft) => {
      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Create failed (${res.status}).`);
      }
      showToast(`Added "${draft.name}" to menu.`);
      await load();
    },
    [load, showToast]
  );

  // Update Item
  const handleUpdate = useCallback(
    async (draft: ItemDraft) => {
      if (!editingItem) return;
      const res = await fetch(`/api/menu/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Update failed (${res.status}).`);
      }
      showToast(`Saved changes to "${draft.name}".`);
      setEditingItem(null);
      await load();
    },
    [editingItem, load, showToast]
  );

  // Delete Item
  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/menu/${deletingItem.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status}).`);
      showToast(`Removed "${deletingItem.name}" from menu.`);
      setDeletingItem(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setIsDeleting(false);
    }
  }, [deletingItem, load, showToast]);

  // Toggle Item Availability
  const toggleItemAvailability = useCallback(
    async (id: string, current: boolean, name: string) => {
      const next = !current;
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, available: next } : it))
      );
      try {
        const res = await fetch(`/api/menu/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ available: next }),
        });
        if (!res.ok) throw new Error();
        showToast(
          next ? `"${name}" is now In Stock.` : `"${name}" marked Sold Out.`
        );
      } catch {
        setItems((prev) =>
          prev.map((it) => (it.id === id ? { ...it, available: current } : it))
        );
        setError("Failed to update item availability.");
      }
    },
    [showToast]
  );

  // Toggle Add-on Availability
  const toggleAddOnAvailability = useCallback(
    async (itemId: string, addOnId: string, current: boolean, addOnName: string) => {
      const next = !current;
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                addOns: it.addOns.map((a) =>
                  a.id === addOnId ? { ...a, available: next } : a
                ),
              }
            : it
        )
      );
      try {
        const res = await fetch(`/api/menu/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toggleAddOn: { addOnId, available: next },
          }),
        });
        if (!res.ok) throw new Error();
        showToast(
          next
            ? `Add-on "${addOnName}" is now In Stock.`
            : `Add-on "${addOnName}" is now Out of Stock.`
        );
      } catch {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  addOns: it.addOns.map((a) =>
                    a.id === addOnId ? { ...a, available: current } : a
                  ),
                }
              : it
          )
        );
        setError("Failed to update add-on availability.");
      }
    },
    [showToast]
  );

  // Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set).sort();
  }, [items]);

  // Filter items
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, activeCategory, searchQuery]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, AdminMenuItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-5 text-espresso">
      {/* Toast Notification (Mobile floating snackbar) */}
      {toast && (
        <div className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-6 z-50 flex items-center justify-center gap-2 rounded-full bg-espresso px-4 py-3 text-xs font-bold text-foam shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <span className="text-emerald-300 font-bold">✓</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Header with quick Add button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-roast/10 pb-4">
        <div>
          <span className="text-[0.65rem] font-bold tracking-[0.22em] uppercase text-roast block">
            Coffee&nbsp;•&nbsp;Desserts
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Menu Management
          </h2>
          <p className="text-xs font-medium text-roast mt-0.5">
            {items.length} items · {categories.length} categories
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-espresso px-5 py-3 sm:py-2.5 text-xs font-bold text-foam shadow-sm hover:opacity-90 active:scale-95 transition-all min-h-[44px]"
        >
          <span className="text-base font-bold leading-none">+</span>
          Add Menu Item
        </button>
      </div>

      {/* Search Input (Full Width on Mobile) */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-roast/60 text-xs">
          🔍
        </span>
        <input
          type="text"
          placeholder="Search menu items or categories…"
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

      {/* Category Filter Pills (Wrap on all screen sizes) */}
      <div className="pb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={
              "rounded-full px-4 py-2 text-xs font-bold transition-all shrink-0 active:scale-95 min-h-[38px] " +
              (activeCategory === "all"
                ? "bg-espresso text-foam shadow-sm"
                : "bg-foam text-roast border border-roast/15 hover:bg-latte/30")
            }
          >
            All ({items.length})
          </button>
          {categories.map((cat) => {
            const count = items.filter((i) => i.category === cat).length;
            const isSelected = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={
                  "rounded-full px-4 py-2 text-xs font-bold transition-all shrink-0 active:scale-95 min-h-[38px] " +
                  (isSelected
                    ? "bg-espresso text-foam shadow-sm"
                    : "bg-foam text-roast border border-roast/15 hover:bg-latte/30")
                }
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-xs font-bold text-red-700 border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs underline hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 text-center text-roast font-medium text-xs">
          Loading menu items…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-roast/20 bg-foam p-8 sm:p-12 text-center">
          <h3 className="text-base font-bold text-espresso">No menu items yet</h3>
          <p className="mt-1 text-xs text-roast">Get started by creating your first coffee shop offering.</p>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="mt-4 rounded-full bg-espresso px-6 py-2.5 text-xs font-bold text-foam hover:opacity-90 min-h-[44px]"
          >
            + Create First Item
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-roast/15 bg-foam p-8 text-center">
          <p className="text-sm font-bold text-espresso">No items match "{searchQuery}"</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
            className="mt-2 text-xs font-bold text-espresso underline p-2 inline-block"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {Array.from(grouped.entries()).map(([category, catItems]) => (
            <section key={category} className="space-y-3">
              <h3 className="text-xs font-bold tracking-[0.18em] uppercase text-roast border-b border-roast/10 pb-1.5 flex items-center gap-2">
                <span>{category}</span>
                <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-espresso border border-roast/10">
                  {catItems.length}
                </span>
              </h3>

              <div className="space-y-3">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={
                      "rounded-2xl border bg-foam p-4 sm:p-5 shadow-xs transition-all hover:border-roast/30 " +
                      (item.available
                        ? "border-roast/15"
                        : "border-roast/30 bg-cream/50")
                    }
                  >
                    {/* Item Title, Base Price & Top Controls */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between sm:justify-start gap-2">
                          <h4 className="text-base sm:text-lg font-bold text-espresso leading-snug">
                            {item.name}
                          </h4>
                          <span className="font-mono text-base font-black text-roast shrink-0">
                            {formatPesos(item.basePriceCents)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="mt-1 text-xs font-medium text-roast leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Desktop / Tablet Controls */}
                      <div className="hidden sm:flex items-center gap-2 shrink-0 pt-0">
                        <button
                          type="button"
                          onClick={() =>
                            toggleItemAvailability(
                              item.id,
                              item.available,
                              item.name
                            )
                          }
                          title="Click to toggle item availability"
                          className={
                            "rounded-full px-3.5 py-1.5 text-xs font-bold border transition-all cursor-pointer min-h-[38px] active:scale-95 " +
                            (item.available
                              ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-950 hover:bg-emerald-900/20"
                              : "border-roast/20 bg-cream text-roast/70 hover:bg-latte/30")
                          }
                        >
                          {item.available ? "● In Stock" : "○ Sold Out"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="rounded-full border border-roast/20 bg-foam px-3.5 py-1.5 text-xs font-bold text-espresso hover:bg-cream transition-colors min-h-[38px] active:scale-95"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingItem(item)}
                          className="rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors min-h-[38px] active:scale-95"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Sizes Section */}
                    {item.sizes.length > 0 && (
                      <div className="mt-3 border-t border-roast/10 pt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-bold tracking-wider uppercase text-roast text-[10px] mr-0.5">
                          Sizes:
                        </span>
                        {item.sizes.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-espresso border border-roast/10"
                          >
                            {s.name}
                            <span className="ml-1 font-mono font-bold text-roast">
                              ({s.priceDeltaCents >= 0 ? "+" : "−"}
                              {formatPesos(Math.abs(s.priceDeltaCents))})
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add-ons Section with Interactive Touch Toggles */}
                    {item.addOns.length > 0 && (
                      <div className="mt-3 border-t border-roast/10 pt-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-roast">
                            Add-ons <span className="font-normal lowercase opacity-75">(tap to toggle stock)</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {item.addOns.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() =>
                                toggleAddOnAvailability(
                                  item.id,
                                  a.id,
                                  a.available,
                                  a.name
                                )
                              }
                              title={`Tap to mark "${a.name}" as ${
                                a.available ? "Out of Stock" : "In Stock"
                              }`}
                              className={
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer active:scale-95 min-h-[36px] " +
                                (a.available
                                  ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-950 active:bg-emerald-900/20"
                                  : "border-roast/20 bg-cream text-roast/60 active:bg-latte/30 line-through")
                              }
                            >
                              <span className="font-bold">
                                {a.available ? "✓" : "✕"}
                              </span>
                              <span>{a.name}</span>
                              <span className="font-mono text-roast font-semibold">
                                (+{formatPesos(a.priceCents)})
                              </span>
                              <span
                                className={
                                  "ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] uppercase font-black tracking-wider " +
                                  (a.available
                                    ? "bg-emerald-800/15 text-emerald-950"
                                    : "bg-roast/15 text-roast")
                                }
                              >
                                {a.available ? "In Stock" : "86'd"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mobile Bottom Action Row */}
                    <div className="flex sm:hidden items-center justify-between gap-2 mt-3.5 border-t border-roast/10 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          toggleItemAvailability(
                            item.id,
                            item.available,
                            item.name
                          )
                        }
                        className={
                          "flex-1 rounded-full px-3 py-2 text-xs font-bold border transition-all active:scale-95 min-h-[40px] text-center " +
                          (item.available
                            ? "border-emerald-700/30 bg-emerald-900/10 text-emerald-950"
                            : "border-roast/20 bg-cream text-roast/70")
                        }
                      >
                        {item.available ? "● In Stock" : "○ Sold Out"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="rounded-full border border-roast/20 bg-foam px-4 py-2 text-xs font-bold text-espresso active:bg-cream transition-colors min-h-[40px] active:scale-95"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingItem(item)}
                        className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 active:bg-red-100 transition-colors min-h-[40px] active:scale-95"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <ItemFormModal
        isOpen={isCreateOpen}
        title="Add New Menu Item"
        initial={emptyDraft()}
        existingCategories={categories}
        submitLabel="Create Item"
        onSubmit={handleCreate}
        onClose={() => setIsCreateOpen(false)}
      />

      {/* Edit Modal */}
      {editingItem && (
        <ItemFormModal
          isOpen={true}
          title={`Edit "${editingItem.name}"`}
          initial={draftFromItem(editingItem)}
          existingCategories={categories}
          submitLabel="Save Changes"
          onSubmit={handleUpdate}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        item={deletingItem}
        isOpen={deletingItem !== null}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteConfirm}
        deleting={isDeleting}
      />
    </div>
  );
}
