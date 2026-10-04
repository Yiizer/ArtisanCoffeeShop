"use client";

import { useEffect, useState, useCallback } from "react";
import { formatPesos } from "@/lib/format";
import { getBusinessDay } from "@/lib/businessDay";
import type { AdminExpense } from "./types";

const CATEGORIES = [
  { id: "RENT", label: "Rent" },
  { id: "WAGES", label: "Staff Wages" },
  { id: "UTILITIES", label: "Utilities (Water, Power, Internet)" },
  { id: "SUPPLIES", label: "General Supplies (Non-inventory)" },
  { id: "OTHER", label: "Other Operating Expenses" },
];

export default function ExpensesManagement() {
  const [expenses, setExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [category, setCategory] = useState<any>("SUPPLIES");
  const [amountPesos, setAmountPesos] = useState("");
  const [businessDay, setBusinessDay] = useState(getBusinessDay(new Date()));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/expenses");
      if (!res.ok) throw new Error("Failed to load expenses.");
      const data = await res.json();
      setExpenses(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountPesos);
    if (!amountPesos || isNaN(amount) || amount <= 0) {
      setError("Please enter an amount > ₱0.00.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          amountCents: Math.round(amount * 100),
          businessDay,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to record expense");
      }

      setAmountPesos("");
      setNote("");
      await fetchExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    try {
      const res = await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete expense");
      await fetchExpenses();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const totalExpenseCents = expenses.reduce((s, e) => s + e.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-espresso">Operating Expenses</h2>
          <p className="text-xs text-roast">Record fixed and overhead costs (rent, wages, utilities, general supplies) that factor into net profit.</p>
        </div>
        <div className="rounded-xl border border-roast/15 bg-foam px-4 py-2 text-right">
          <span className="text-[10px] uppercase font-bold text-roast block tracking-wider">Total Recorded</span>
          <span className="text-base font-bold text-espresso">{formatPesos(totalExpenseCents)}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Expense Form */}
      <div className="rounded-2xl border border-roast/15 bg-foam p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-espresso">Record New Expense</h3>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="font-semibold text-roast block mb-1">Category</label>
            <select
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso font-medium"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-roast block mb-1">Amount (₱)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="₱0.00"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso font-medium"
              value={amountPesos}
              onChange={(e) => setAmountPesos(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-semibold text-roast block mb-1">Business Day</label>
            <input
              type="date"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso font-medium"
              value={businessDay}
              onChange={(e) => setBusinessDay(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-semibold text-roast block mb-1">Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. October Storefront Lease"
              className="w-full rounded-lg border border-roast/20 bg-cream p-2 text-espresso font-medium"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="sm:col-span-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2">
            <p className="text-[11px] text-roast italic">
              {category === "SUPPLIES"
                ? "💡 Note: General supplies are items NOT tracked in Inventory (cleaning supplies, napkins, trash bags). Ingredient & cup restocks go through Inventory → Restock."
                : "Expenses directly reduce net profit for the corresponding business day range."}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-espresso px-5 py-2 font-bold text-foam hover:opacity-90 transition active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Adding..." : "+ Record Expense"}
            </button>
          </div>
        </form>
      </div>

      {/* Expenses Table */}
      <div className="overflow-hidden rounded-2xl border border-roast/15 bg-foam shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-roast/10 bg-cream/50 text-[11px] font-bold uppercase tracking-wider text-roast">
              <tr>
                <th className="py-3 px-4">Business Day</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Note</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-roast/10 text-espresso">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-roast">
                    Loading expenses...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-roast">
                    No operating expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-cream/40 transition">
                    <td className="py-3 px-4 font-mono font-medium">{exp.businessDay}</td>
                    <td className="py-3 px-4 font-semibold">
                      <span className="rounded bg-cream px-2 py-0.5 text-[10px] font-bold text-roast">
                        {CATEGORIES.find((c) => c.id === exp.category)?.label ?? exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-espresso">
                      {formatPesos(exp.amountCents)}
                    </td>
                    <td className="py-3 px-4 text-roast">{exp.note || "—"}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(exp.id)}
                        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
