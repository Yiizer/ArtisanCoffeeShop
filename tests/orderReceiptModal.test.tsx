import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OrderReceiptModal from "../components/admin/OrderReceiptModal";
import type { AdminOrder } from "../components/admin/types";

describe("OrderReceiptModal", () => {
  it("renders null when order is null", () => {
    const html = renderToStaticMarkup(
      <OrderReceiptModal order={null} onClose={() => {}} />
    );
    expect(html).toBe("");
  });

  it("renders receipt with required details and excludes omitted fields", () => {
    const mockOrder: AdminOrder = {
      id: "ord-1",
      dailyNumber: 1,
      customerName: "Alice Secret",
      status: "COMPLETED",
      paymentMethod: "GCASH",
      paymentRef: "GCASH-9999",
      isPaid: true,
      refunded: false,
      totalPriceCents: 73500,
      costCents: 32000,
      uncostedLines: 0,
      hasStockUsage: true,
      // 2026-10-04 14:15:00 in Asia/Manila (UTC+8) -> 06:15:00 UTC
      createdAt: "2026-10-04T06:15:00.000Z",
      items: [
        {
          id: "item-1",
          quantity: 2,
          notes: "Extra sweet",
          lineTotalCents: 24000,
          costCents: 10000,
          menuItem: { name: "OG Chocochip" },
          size: null,
          addOns: [],
        },
        {
          id: "item-2",
          quantity: 1,
          notes: null,
          lineTotalCents: 12000,
          costCents: 5000,
          menuItem: { name: "PB Oatmeal" },
          size: null,
          addOns: [],
        },
        {
          id: "item-3",
          quantity: 2,
          notes: null,
          lineTotalCents: 24000,
          costCents: 11000,
          menuItem: { name: "Red Velvet CC" },
          size: { name: "Large" },
          addOns: [{ addOn: { name: "Extra Shot" } }],
        },
      ],
    };

    const html = renderToStaticMarkup(
      <OrderReceiptModal order={mockOrder} onClose={() => {}} />
    );

    // 1. Artisan wordmark
    expect(html).toContain("artisan");
    expect(html).toContain("coffee");
    expect(html).toContain("desserts");

    // 2. Order # and Asia/Manila Date/Time
    expect(html).toContain("Order #1");
    expect(html).toContain("Sun, Oct 4, 2026");
    expect(html).toContain("2:15 PM");

    // 3. Products ordered and prices
    expect(html).toContain("2× OG Chocochip");
    expect(html).toContain("₱240.00");
    expect(html).toContain("1× PB Oatmeal");
    expect(html).toContain("₱120.00");
    expect(html).toContain("2× Red Velvet CC");
    expect(html).toContain("Large · Extra Shot");

    // 4. TOTAL
    expect(html).toContain("TOTAL");
    expect(html).toContain("₱735.00");

    // 5. Close button
    expect(html).toContain("Close");

    // 6. Explicitly NOT shown per plan requirements
    expect(html).not.toContain("Alice Secret");
    expect(html).not.toContain("COMPLETED");
    expect(html).not.toContain("GCASH-9999");
    expect(html).not.toContain("320.00"); // costCents
    expect(html).not.toContain("Margin");
  });

  it("DayTable renders interactive desktop rows and mobile button cards", async () => {
    const { DayTable } = await import("../components/admin/OrderHistory");
    const mockOrder: AdminOrder = {
      id: "ord-1",
      dailyNumber: 1,
      customerName: "Alice",
      status: "COMPLETED",
      paymentMethod: "CASH",
      paymentRef: null,
      isPaid: true,
      refunded: false,
      totalPriceCents: 15000,
      costCents: 5000,
      uncostedLines: 0,
      hasStockUsage: true,
      createdAt: "2026-10-04T06:15:00.000Z",
      items: [
        {
          id: "item-1",
          quantity: 1,
          notes: null,
          lineTotalCents: 15000,
          costCents: 5000,
          menuItem: { name: "Latte" },
          size: { name: "Regular" },
          addOns: [],
        },
      ],
    };

    const html = renderToStaticMarkup(
      <DayTable orders={[mockOrder]} onSelectOrder={() => {}} />
    );

    // Desktop row attributes
    expect(html).toContain('id="order-row-1"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');

    // Mobile button card attributes
    expect(html).toContain('id="order-card-1"');
    expect(html).toContain('<button');
  });
});
