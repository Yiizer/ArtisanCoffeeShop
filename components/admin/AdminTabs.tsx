"use client";

import { useState } from "react";
import MenuManagement from "./MenuManagement";
import OrderHistory from "./OrderHistory";

type TabId = "menu" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "menu", label: "Menu Management" },
  { id: "history", label: "Order History" },
];

export default function AdminTabs() {
  const [active, setActive] = useState<TabId>("menu");

  return (
    <div>
      {/* Mobile-friendly segmented tab bar */}
      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex rounded-full border border-roast/15 bg-cream p-1 max-w-md mx-auto sm:mx-0 shadow-2xs"
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
                "flex-1 rounded-full py-2 px-4 text-xs sm:text-sm font-bold transition-all text-center select-none active:scale-95 " +
                (on
                  ? "bg-espresso text-foam shadow-xs"
                  : "text-roast hover:text-espresso hover:bg-latte/20")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {active === "menu" ? <MenuManagement /> : <OrderHistory />}
      </div>
    </div>
  );
}
