"use client";

import { useEffect, useState } from "react";
import MenuManagement from "./MenuManagement";
import OrderHistory from "./OrderHistory";
import InventoryManagement from "./InventoryManagement";
import ExpensesManagement from "./ExpensesManagement";

type TabId = "menu" | "inventory" | "expenses" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "menu", label: "Menu Management" },
  { id: "inventory", label: "Inventory & Recipes" },
  { id: "expenses", label: "Expenses" },
  { id: "history", label: "Order History & Profit" },
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
    <div>
      {/* Segmented tab bar */}
      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex flex-wrap sm:flex-nowrap rounded-2xl border border-roast/15 bg-cream p-1 max-w-2xl mx-auto sm:mx-0 shadow-2xs gap-1 sm:gap-0"
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
                "flex-1 relative rounded-xl py-2 px-3 text-xs sm:text-sm font-bold transition-all text-center select-none active:scale-95 flex items-center justify-center gap-1.5 " +
                (on
                  ? "bg-espresso text-foam shadow-xs"
                  : "text-roast hover:text-espresso hover:bg-latte/20")
              }
            >
              <span>{tab.label}</span>
              {tab.id === "inventory" && pendingPriceCount > 0 && (
                <span className="rounded-full bg-amber-500 text-foam text-[10px] font-extrabold px-1.5 py-0.2">
                  {pendingPriceCount}
                </span>
              )}
              {tab.id === "inventory" && hasLowStock && pendingPriceCount === 0 && (
                <span className="h-2 w-2 rounded-full bg-amber-500" title="Low stock alert" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {active === "menu" && <MenuManagement />}
        {active === "inventory" && <InventoryManagement />}
        {active === "expenses" && <ExpensesManagement />}
        {active === "history" && <OrderHistory />}
      </div>
    </div>
  );
}
