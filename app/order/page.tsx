"use client";

import { useState } from "react";
import OrderEntry from "@/components/order/OrderEntry";
import LiveQueue from "@/components/order/LiveQueue";

type SectionId = "entry" | "queue";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "entry", label: "Order Entry" },
  { id: "queue", label: "Live Queue" },
];

export default function OrderPage() {
  const [active, setActive] = useState<SectionId>("entry");

  return (
    <div className="space-y-5 text-espresso overflow-hidden">
      {/* Header & Segmented Mode Switch */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-roast/10 pb-4">
        <div className="min-w-0">
          <span className="text-[0.65rem] font-bold tracking-[0.22em] uppercase text-roast block">
            Counter POS
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-espresso">
            Order Taking
          </h1>
        </div>

        {/* Segmented Touch Tab Switch */}
        <div
          role="tablist"
          aria-label="Order-taking sections"
          className="flex rounded-full border border-roast/15 bg-cream p-1 w-full sm:w-72 shadow-2xs"
        >
          {SECTIONS.map((s) => {
            const on = s.id === active;
            return (
              <button
                key={s.id}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setActive(s.id)}
                className={
                  "flex-1 rounded-full py-2 px-4 text-xs sm:text-sm font-bold text-center transition-all select-none active:scale-95 min-h-[40px] " +
                  (on
                    ? "bg-espresso text-foam shadow-xs"
                    : "text-roast hover:text-espresso hover:bg-latte/20")
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-1">
        <section role="tabpanel" aria-label="Order Entry" hidden={active !== "entry"}>
          <OrderEntry />
        </section>
        <section role="tabpanel" aria-label="Live Queue" hidden={active !== "queue"}>
          <LiveQueue />
        </section>
      </div>
    </div>
  );
}
