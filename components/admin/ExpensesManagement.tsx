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
    <div className="space-y-4 sm:space-y-6 text-espresso">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-roast/10 pb-3 sm:pb-4">
        <div>
          <span className="text-[0.65rem] font-bold tracking-[0.22em] uppercase text-roast block">
            Overhead & Fixed Costs
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Operating Expenses
          </h2>
          <p className="text-xs text-roast mt-0.5">
            Deducts from revenue and gross profit to calculate net profit.
          </p>
        </div>

        <div className="rounded-2xl border border-roast/15 bg-foam px-4 py-2.5 flex items-center justify-between sm:justify-end gap-3 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-roast tracking-wider">Total Recorded</span>
          <span className="text-base font-black font-mono text-espresso">{formatPesos(totalExpenseCents)}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 p-3.5 text-xs text-red-700 font-bold border border-red-200">
          {error}
        </div>
      )}

      {/* Expense Form */}
      <div className="rounded-2xl border border-roast/15 bg-foam p-4 sm:p-5 shadow-2xs space-y-3.5">
        <h3 className="font-bold text-sm text-espresso">Record New Expense</h3>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Category</label>
            <select
              className="w-full rounded-xl border border-roast/20 bg-cream px-3 py-2.5 text-base sm:text-xs text-espresso font-semibold focus:border-espresso focus:outline-none min-h-[44px]"
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
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Amount (₱)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 1500.00"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3 py-2.5 text-base sm:text-xs text-espresso font-semibold focus:border-espresso focus:outline-none min-h-[44px]"
              value={amountPesos}
              onChange={(e) => setAmountPesos(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Business Day</label>
            <input
              type="date"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3 py-2.5 text-base sm:text-xs text-espresso font-semibold focus:border-espresso focus:outline-none min-h-[44px]"
              value={businessDay}
              onChange={(e) => setBusinessDay(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-bold uppercase tracking-wider text-[10px] text-roast block mb-1">Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Storefront Lease"
              className="w-full rounded-xl border border-roast/20 bg-cream px-3 py-2.5 text-base sm:text-xs text-espresso font-medium focus:border-espresso focus:outline-none min-h-[44px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="sm:col-span-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2 border-t border-roast/10">
            <p className="text-[11px] text-roast italic">
              {category === "SUPPLIES"
                ? "💡 General supplies are items NOT tracked in Inventory (cleaning supplies, napkins, trash bags)."
                : "Expenses reduce net profit for the corresponding business day range."}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto rounded-full bg-espresso px-6 py-2.5 font-bold text-xs sm:text-sm text-foam hover:opacity-90 transition active:scale-95 disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? "Saving..." : "+ Record Expense"}
            </button>
          </div>
        </form>
      </div>

      {/* Expenses List: Mobile Cards (< md) + Desktop Table (md+) */}
      {loading ? (
        <div className="py-12 text-center text-roast font-semibold text-xs animate-pulse">
          Loading expenses...
        </div>
      ) : expenses.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-roast/20 bg-foam p-8 sm:p-12 text-center">
          <h3 className="text-base font-bold text-espresso">No operating expenses recorded</h3>
          <p className="mt-1 text-xs text-roast">Log utilities, rent, and general supplies to track true net profit.</p>
        </div>
      ) : (
        <>
          {/* Mobile Card List (< md) */}
          <div className="md:hidden space-y-2.5">
            {expenses.map((exp) => (
              <div key={exp.id} className="rounded-2xl border border-roast/15 bg-foam p-3.5 shadow-2xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-roast border border-roast/10">
                      {CATEGORIES.find((c) => c.id === exp.category)?.label ?? exp.category}
                    </span>
                    <p className="text-xs font-mono text-roast mt-1 font-semibold">{exp.businessDay}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-base font-black text-espresso block">
                      {formatPesos(exp.amountCents)}
                    </span>
                  </div>
                </div>

                {exp.note && (
                  <p className="text-xs text-roast/80 italic bg-cream/50 rounded-xl px-2.5 py-1.5 border border-roast/10">
                    "{exp.note}"
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleDelete(exp.id)}
                    className="min-h-[36px] rounded-lg border border-red-200 bg-red-50/50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                  >
                    Delete Record
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-roast/15 bg-foam shadow-sm">
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
                {expenses.map((exp) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
