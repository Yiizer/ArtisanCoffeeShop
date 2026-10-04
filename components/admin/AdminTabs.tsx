"use client";

import { useEffect, useState } from "react";
import MenuManagement from "./MenuManagement";
import OrderHistory from "./OrderHistory";
import InventoryManagement from "./InventoryManagement";
import ExpensesManagement from "./ExpensesManagement";

type TabId = "menu" | "inventory" | "expenses" | "history";

const TABS: { id: TabId; label: string; shortLabel: string; icon: string }[] = [
  { id: "menu", label: "Menu Management", shortLabel: "Menu", icon: "☕" },
  { id: "inventory", label: "Inventory & Recipes", shortLabel: "Inventory", icon: "📦" },
  { id: "expenses", label: "Operating Expenses", shortLabel: "Expenses", icon: "💸" },
  { id: "history", label: "Profit & History", shortLabel: "Profit", icon: "📈" },
];

export default function AdminTabs() {
  const [active, setActive] = useState<TabId>("menu");
  const [pendingPriceCount, setPendingPriceCount] = useState<number>(0);
  const [hasLowStock, setHasLowStock] = useState<boolean>(false);

  useEffect(() => {
    async function checkBadges() {
      try {
        const [revRes, ingRes] = await Promise.all([
          fetch("/api/admin/movements/pending"),
          fetch("/api/admin/ingredients"),
        ]);
        if (revRes.ok) {
          const revs = await revRes.json();
          setPendingPriceCount(revs.length);
        }
        if (ingRes.ok) {
          const ings = await ingRes.json();
          const low = ings.some((i: any) => !i.archivedAt && (i.isLowStock || i.isOutOfStock));
          setHasLowStock(low);
        }
      } catch {
        // ignore
      }
    }
    checkBadges();
  }, [active]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile-Optimized Segmented Tab Bar */}
      <div className="w-full overflow-x-auto no-scrollbar py-0.5">
        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex items-center gap-1 sm:gap-1.5 rounded-2xl border border-roast/15 bg-cream/90 p-1 shadow-2xs w-full min-w-fit max-w-3xl"
        >
          {TABS.map((tab) => {
            const on = tab.id === active;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setActive(tab.id)}
                className={
                  "flex-1 relative rounded-xl py-2 px-3 sm:px-4 text-xs sm:text-sm font-bold transition-all text-center select-none active:scale-95 flex items-center justify-center gap-1.5 min-h-[40px] whitespace-nowrap shrink-0 " +
                  (on
                    ? "bg-espresso text-foam shadow-xs"
                    : "text-roast hover:text-espresso hover:bg-latte/20")
                }
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="inline sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>

                {tab.id === "inventory" && pendingPriceCount > 0 && (
                  <span className="rounded-full bg-amber-500 text-foam text-[10px] font-black px-1.5 py-0.2 shrink-0 animate-pulse">
                    {pendingPriceCount}
                  </span>
                )}
                {tab.id === "inventory" && hasLowStock && pendingPriceCount === 0 && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Low stock alert" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {active === "menu" && <MenuManagement />}
        {active === "inventory" && <InventoryManagement />}
        {active === "expenses" && <ExpensesManagement />}
        {active === "history" && <OrderHistory />}
      </div>
    </div>
  );
}
