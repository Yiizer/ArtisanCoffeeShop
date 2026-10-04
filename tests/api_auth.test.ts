import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { AUTH_COOKIE_NAME, createAuthToken } from "../lib/auth";
import { listMenu, createMenuItem } from "../lib/menu";
import { GET as getInventoryIngredients } from "../app/api/inventory/ingredients/route";
import { POST as postInventoryMovements } from "../app/api/inventory/movements/route";

describe("API Authorization & Role Enforcement", () => {
  it("unauthenticated request to /api/inventory/ingredients returns 401 JSON", async () => {
    // 1. Through middleware
    const req = new NextRequest("http://localhost:3000/api/inventory/ingredients");
    const res = await middleware(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Authentication required/i);

    // 2. Through route handler (without cookie)
    const handlerRes = await getInventoryIngredients(req);
    expect(handlerRes.status).toBe(401);
  });

  it("STAFF request to /api/admin/* returns 403", async () => {
    const staffToken = await createAuthToken({
      userId: "staff_1",
      username: "staff",
      name: "Staff Member",
      role: "STAFF",
    });

    const req = new NextRequest("http://localhost:3000/api/admin/ingredients", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${staffToken}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Administrator privileges required/i);
  });

  it("STAFF cannot perform ADJUSTMENT movements (403)", async () => {
    const staffToken = await createAuthToken({
      userId: "staff_1",
      username: "staff",
      name: "Staff Member",
      role: "STAFF",
    });

    const req = new NextRequest("http://localhost:3000/api/inventory/movements", {
      method: "POST",
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${staffToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ingredientId: "some-id",
        reason: "ADJUSTMENT",
        qty: 10,
      }),
    });

    const res = await postInventoryMovements(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Staff can only record RESTOCK or WASTE/i);
  });

  it("STAFF GET /api/menu contains inStock but no cost fields", async () => {
    let staffMenu = await listMenu(false); // staff
    if (staffMenu.length === 0) {
      await createMenuItem({
        name: "Auth Test Coffee",
        category: "Coffee",
        basePriceCents: 12000,
        sizes: [{ name: "Regular", priceDeltaCents: 0 }],
        addOns: [{ name: "Vanilla", priceCents: 2000 }],
        noIngredients: true,
      });
      staffMenu = await listMenu(false);
    }
    const adminMenu = await listMenu(true);  // admin

    expect(staffMenu.length).toBeGreaterThan(0);
    expect(adminMenu.length).toBeGreaterThan(0);

    for (const item of staffMenu) {
      expect(item.inStock).toBeDefined();
      expect((item as any).ingredients).toBeUndefined();
      expect((item as any).costCents).toBeUndefined();
      for (const size of item.sizes) {
        expect(size.inStock).toBeDefined();
        expect((size as any).costCents).toBeUndefined();
        expect((size as any).marginPct).toBeUndefined();
      }
    }

    for (const item of adminMenu) {
      expect(item.ingredients).toBeDefined();
      expect(item.noIngredients).toBeDefined();
      for (const size of item.sizes) {
        expect((size as any).ingredients).toBeDefined();
      }
    }
  });
});
