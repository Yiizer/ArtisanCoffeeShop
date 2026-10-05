"use client";

import React, { useEffect } from "react";
import { formatPesos } from "@/lib/format";
import type { AdminOrder } from "./types";

interface OrderReceiptModalProps {
  order: AdminOrder | null;
  onClose: () => void;
}

function formatOrderDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const datePart = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Manila",
    });
    return `${datePart} · ${timePart}`;
  } catch {
    return isoString;
  }
}

export default function OrderReceiptModal({
  order,
  onClose,
}: OrderReceiptModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!order) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-receipt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4 backdrop-blur-xs transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-roast/15 bg-foam p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-espresso flex flex-col max-h-[85vh]">
        {/* Brand wordmark — matches TopBar */}
        <div className="flex flex-col items-center leading-none select-none text-center">
          <span className="text-xl sm:text-2xl font-black tracking-[-0.04em] text-espresso lowercase">
            artisan
          </span>
          <span className="text-[0.6rem] font-medium tracking-[0.2em] uppercase text-roast mt-1">
            coffee&nbsp;•&nbsp;desserts
          </span>
        </div>

        {/* Dashed divider */}
        <div className="border-t border-dashed border-roast/25 my-4" />

        {/* Order # and Date/Time */}
        <div className="text-center">
          <h3
            id="order-receipt-title"
            className="text-base font-bold text-espresso"
          >
            Order #{order.dailyNumber}
          </h3>
          <p className="mt-0.5 text-xs text-roast">
            {formatOrderDateTime(order.createdAt)}
          </p>
        </div>

        {/* Dashed divider */}
        <div className="border-t border-dashed border-roast/25 my-4" />

        {/* Products ordered (scrollable if long) */}
        <div className="flex-1 overflow-y-auto space-y-3 py-1 pr-1">
          {order.items.map((item) => {
            const details: string[] = [];
            if (item.size?.name) details.push(item.size.name);
            if (item.addOns && item.addOns.length > 0) {
              details.push(item.addOns.map((a) => a.addOn.name).join(", "));
            }
            const detailsText = details.join(" · ");

            return (
              <div key={item.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-espresso">
                    {item.quantity}× {item.menuItem.name}
                  </span>
                  <span className="font-mono font-bold text-espresso shrink-0">
                    {item.lineTotalCents !== null && item.lineTotalCents !== undefined
                      ? formatPesos(item.lineTotalCents)
                      : "—"}
                  </span>
                </div>
                {detailsText && (
                  <p className="mt-0.5 text-[11px] text-roast pl-4">
                    ({detailsText})
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Dashed divider */}
        <div className="border-t border-dashed border-roast/25 my-4" />

        {/* Total */}
        <div className="flex items-baseline justify-between text-sm font-black text-espresso">
          <span className="tracking-wider uppercase">TOTAL</span>
          <span className="font-mono text-base">
            {formatPesos(order.totalPriceCents)}
          </span>
        </div>

        {/* Close Button */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-roast/20 bg-foam px-8 py-2 text-xs font-bold text-roast hover:bg-cream hover:text-espresso active:scale-95 transition-all shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
