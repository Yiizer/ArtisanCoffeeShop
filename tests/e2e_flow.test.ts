import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../lib/db";
import { createAuthToken, AUTH_COOKIE_NAME, hashPassword } from "../lib/auth";
import { GET as getMenu } from "../app/api/menu/route";
import { GET as getStaffIngredients } from "../app/api/inventory/ingredients/route";
import { POST as postStaffMovements } from "../app/api/inventory/movements/route";
import { POST as postOrder, GET as getOrders } from "../app/api/orders/route";
import { PATCH as patchOrder, DELETE as deleteOrder } from "../app/api/orders/[id]/route";
import { GET as getSummary } from "../app/api/admin/summary/route";
import { GET as getPendingMovements } from "../app/api/admin/movements/pending/route";
import { POST as postReviewMovement } from "../app/api/admin/movements/[id]/review/route";
import { GET as getReconcile } from "../app/api/admin/inventory/reconcile/route";
import { NextRequest } from "next/server";
import { toDec } from "../lib/decimal";

describe("Full End-to-End System & API Flow", () => {
  let adminToken: string;
  let staffToken: string;
  let adminUser: any;
  let staffUser: any;

  beforeAll(async () => {
    // Ensure users exist
    const adminHash = await hashPassword("admin123");
    adminUser = await prisma.user.upsert({
      where: { username: "admin" },
      update: { role: "ADMIN" },
      create: {
        username: "admin",
        passwordHash: adminHash,
        name: "Store Manager",
        role: "ADMIN",
        pin: "8888",
      },
    });

    const staffHash = await hashPassword("cashier123");
    staffUser = await prisma.user.upsert({
      where: { username: "cashier" },
      update: { role: "STAFF" },
      create: {
        username: "cashier",
        passwordHash: staffHash,
        name: "Front Cashier",
        role: "STAFF",
        pin: "1234",
      },
    });

    adminToken = await createAuthToken({
      userId: adminUser.id,
      username: adminUser.username,
      name: adminUser.name,
      role: adminUser.role,
    });

    staffToken = await createAuthToken({
      userId: staffUser.id,
      username: staffUser.username,
      name: staffUser.name,
      role: staffUser.role,
    });

    // Ensure test ingredients
    let beans = await prisma.ingredient.findFirst({ where: { name: "Espresso Beans" } });
    if (!beans) {
      beans = await prisma.ingredient.create({
        data: {
          name: "Espresso Beans",
          unit: "G",
          stockQty: 10000,
          unitCostCents: 1.5,
          lowStockThreshold: 2000,
          movements: {
            create: {
              qtyChange: 10000,
              unitCostCents: 1.5,
              reason: "OPENING",
            },
          },
        },
      });
    }

    let milk = await prisma.ingredient.findFirst({ where: { name: "Whole Milk" } });
    if (!milk) {
      milk = await prisma.ingredient.create({
        data: {
          name: "Whole Milk",
          unit: "ML",
          stockQty: 20000,
          unitCostCents: 0.12,
          lowStockThreshold: 4000,
          movements: {
            create: {
              qtyChange: 20000,
              unitCostCents: 0.12,
              reason: "OPENING",
            },
          },
        },
      });
    }

    let cap = await prisma.menuItem.findFirst({ where: { name: "Cappuccino" } });
    if (!cap) {
      cap = await prisma.menuItem.create({
        data: {
          name: "Cappuccino",
          category: "Espresso",
          basePriceCents: 13000,
          available: true,
          ingredients: {
            create: [
              { ingredientId: beans.id, qty: 18 },
              { ingredientId: milk.id, qty: 180 },
            ],
          },
          sizes: {
            create: [
              { name: "Small", priceDeltaCents: -1500 },
              { name: "Regular", priceDeltaCents: 0 },
            ],
          },
          addOns: {
            create: [
              { name: "Extra Shot", priceCents: 3000, available: true },
            ],
          },
        },
      });
    }

    let croissant = await prisma.menuItem.findFirst({ where: { name: "Butter Croissant" } });
    if (!croissant) {
      croissant = await prisma.menuItem.create({
        data: {
          name: "Butter Croissant",
          category: "Pastries",
          basePriceCents: 8500,
          available: true,
          noIngredients: true,
        },
      });
    }
  });

  function makeReq(url: string, method = "GET", token = adminToken, body?: any) {
    return new NextRequest(url, {
      method,
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it("1. Staff view of menu hides costs and shows inStock; Admin view shows recipes and margins", async () => {
    // Staff view
    const staffReq = makeReq("http://localhost:3000/api/menu", "GET", staffToken);
    const staffRes = await getMenu(staffReq);
    const staffData = await staffRes.json();
    expect(staffData.length).toBeGreaterThan(0);

    const capStaff = staffData.find((i: any) => i.name === "Cappuccino");
    expect(capStaff).toBeDefined();
    expect(capStaff.inStock).toBe(true);
    expect(capStaff.ingredients).toBeUndefined();
    expect(capStaff.sizes[0].costCents).toBeUndefined();
    expect(capStaff.sizes[0].marginPct).toBeUndefined();

    // Admin view
    const adminReq = makeReq("http://localhost:3000/api/menu", "GET", adminToken);
    const adminRes = await getMenu(adminReq);
    const adminData = await adminRes.json();
    const capAdmin = adminData.find((i: any) => i.name === "Cappuccino");
    expect(capAdmin.ingredients).toBeDefined();
    expect(capAdmin.sizes[0].costCents).toBeDefined();
  });

  it("2. Staff checks inventory ingredients (costs stripped)", async () => {
    const staffReq = makeReq("http://localhost:3000/api/inventory/ingredients", "GET", staffToken);
    const res = await getStaffIngredients(staffReq);
    expect(res.status).toBe(200);
    const ings = await res.json();
    expect(ings.length).toBeGreaterThan(0);

    for (const ing of ings) {
      expect(ing.id).toBeDefined();
      expect(ing.name).toBeDefined();
      expect(ing.stockQty).toBeDefined();
      expect(ing.unitCostCents).toBeUndefined(); // strictly stripped
    }
  });

  it("3. Places an order with multiple items and recipes, deducting stock cleanly", async () => {
    const adminReq = makeReq("http://localhost:3000/api/menu", "GET", adminToken);
    const menuRes = await getMenu(adminReq);
    const menu = await menuRes.json();
    const cap = menu.find((i: any) => i.name === "Cappuccino");
    const croissant = menu.find((i: any) => i.name === "Butter Croissant");

    expect(cap).toBeDefined();
    expect(croissant).toBeDefined();

    // Check initial bean stock
    const beansBefore = await prisma.ingredient.findFirst({ where: { name: "Espresso Beans" } });
    const beansStockBefore = toDec(beansBefore!.stockQty);

    const orderReq = makeReq("http://localhost:3000/api/orders", "POST", staffToken, {
      customerName: "Alice",
      paymentMethod: "CASH",
      isPaid: true,
      items: [
        { menuItemId: cap.id, sizeId: cap.sizes[0].id, quantity: 1 },
        { menuItemId: croissant.id, quantity: 1 },
      ],
    });

    const createRes = await postOrder(orderReq);
    expect(createRes.status).toBe(201);
    const order = await createRes.json();

    expect(order.dailyNumber).toBeGreaterThan(0);
    expect(order.status).toBe("PENDING");
    expect(order.isPaid).toBe(true);
    expect(order.totalPriceCents).toBeGreaterThan(0);

    // Verify stock was deducted: Cappuccino uses 18g beans
    const beansAfter = await prisma.ingredient.findFirst({ where: { name: "Espresso Beans" } });
    expect(toDec(beansAfter!.stockQty).toString()).toBe(beansStockBefore.minus(18).toString());

    // 4. Live Queue query
    const queueReq = makeReq("http://localhost:3000/api/orders", "GET", staffToken);
    const queueRes = await getOrders(queueReq);
    const queue = await queueRes.json();
    const queuedOrder = queue.find((o: any) => o.id === order.id);
    expect(queuedOrder).toBeDefined();
    expect(queuedOrder.hasStockUsage).toBe(true);

    // 5. Advance order to READY
    const patchReq = makeReq(`http://localhost:3000/api/orders/${order.id}`, "PATCH", staffToken, {
      kind: "status",
      status: "READY",
    });
    const patchRes = await patchOrder(patchReq, { params: Promise.resolve({ id: order.id }) });
    expect(patchRes.status).toBe(200);
    const readyOrder = await patchRes.json();
    expect(readyOrder.status).toBe("READY");

    // 6. Cancel order with wasMade=false (drink was NOT prepared -> return stock)
    const cancelReq = makeReq(`http://localhost:3000/api/orders/${order.id}?wasMade=false`, "DELETE", staffToken);
    const cancelRes = await deleteOrder(cancelReq, { params: Promise.resolve({ id: order.id }) });
    expect(cancelRes.status).toBe(200);
    const cancelled = await cancelRes.json();
    expect(cancelled.status).toBe("CANCELLED");

    // Stock should be restored to initial!
    const beansRestored = await prisma.ingredient.findFirst({ where: { name: "Espresso Beans" } });
    expect(toDec(beansRestored!.stockQty).toString()).toBe(beansStockBefore.toString());
  });

  it("7. Staff records restock with price -> Admin review queue -> Price confirmation", async () => {
    const milk = await prisma.ingredient.findFirst({ where: { name: "Whole Milk" } });
    expect(milk).toBeDefined();

    // Staff adds 10,000ml milk, reports total paid ₱1,500 (150000 cents -> 0.15/ml, +25% jump from 0.12)
    const restockReq = makeReq("http://localhost:3000/api/inventory/movements", "POST", staffToken, {
      ingredientId: milk!.id,
      reason: "RESTOCK",
      qty: 10000,
      reportedPaidCents: 150000,
      note: "Bought from grocery",
    });
    const restockRes = await postStaffMovements(restockReq);
    expect(restockRes.status).toBe(201);
    const movement = await restockRes.json();
    expect(movement.costReview).toBe("PENDING");

    // Admin checks pending review list
    const pendingReq = makeReq("http://localhost:3000/api/admin/movements/pending", "GET", adminToken);
    const pendingRes = await getPendingMovements(pendingReq);
    expect(pendingRes.status).toBe(200);
    const pendingList = await pendingRes.json();
    const found = pendingList.find((p: any) => p.movementId === movement.id);
    expect(found).toBeDefined();
    expect(found.reportedPaidCents).toBe(150000);

    // Admin confirms price
    const reviewReq = makeReq(`http://localhost:3000/api/admin/movements/${movement.id}/review`, "POST", adminToken, {
      action: "CONFIRM",
    });
    const reviewRes = await postReviewMovement(reviewReq, { params: Promise.resolve({ id: movement.id }) });
    expect(reviewRes.status).toBe(200);

    // Ingredient unit cost should now be updated to 0.1500!
    const milkUpdated = await prisma.ingredient.findUnique({ where: { id: milk!.id } });
    expect(toDec(milkUpdated!.unitCostCents!).toNumber()).toBe(15);
  });

  it("8. Reconcile endpoint verifies zero drift across all ingredients", async () => {
    const reconcileReq = makeReq("http://localhost:3000/api/admin/inventory/reconcile", "GET", adminToken);
    const reconcileRes = await getReconcile(reconcileReq);
    expect(reconcileRes.status).toBe(200);
    const report = await reconcileRes.json();
    expect(report.reconciled).toBe(true);
    expect(report.discrepancies.length).toBe(0);
  });
});
