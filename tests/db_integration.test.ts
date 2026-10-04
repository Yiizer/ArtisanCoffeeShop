import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../lib/db";
import { createOrder, cancelOrder, updateOrder, OrderServiceError } from "../lib/orders";
import {
  createIngredient,
  updateIngredient,
  staffRestock,
  adminRestock,
  staffWaste,
  adminAdjust,
  confirmCostReview,
  dismissCostReview,
  reconcile,
  archiveIngredient,
  unarchiveIngredient,
  listPendingCostReviews,
} from "../lib/inventory";
import { createExpense, listExpenses } from "../lib/expenses";
import { createMenuItem, listMenu } from "../lib/menu";
import { getBusinessDay } from "../lib/businessDay";
import { toDec } from "../lib/decimal";
import { Decimal } from "decimal.js";

describe("Database & Concurrency Integration Suite", () => {
  let ingBeansId: string;
  let ingMilkId: string;
  let menuItemId: string;
  let smallSizeId: string;
  let largeSizeId: string;

  beforeAll(async () => {
    // Clean up test data if any
    await prisma.stockMovement.deleteMany({});
    await prisma.orderItemAddOn.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.dailyCounter.deleteMany({});
    await prisma.expense.deleteMany({});
    await prisma.sizeIngredient.deleteMany({});
    await prisma.menuItemIngredient.deleteMany({});
    await prisma.menuItemSize.deleteMany({});
    await prisma.menuItemAddOn.deleteMany({});
    await prisma.menuItem.deleteMany({});
    await prisma.ingredient.deleteMany({});

    // Create test ingredients
    const beans = await createIngredient({
      name: "Espresso Beans",
      unit: "G",
      initialStock: 10000,
      unitCostCents: 50, // 50 centavos / g
    });
    ingBeansId = beans.id;

    const milk = await createIngredient({
      name: "Fresh Milk",
      unit: "ML",
      initialStock: 20000,
      unitCostCents: 8, // 8 centavos / ml
    });
    ingMilkId = milk.id;

    // Create test menu item with sizes and ingredients
    const item = await createMenuItem({
      name: "Flat White",
      category: "Coffee",
      basePriceCents: 14000,
      sizes: [
        {
          name: "Small",
          priceDeltaCents: 0,
          ingredients: [
            { ingredientId: ingBeansId, qtyDelta: 0 },
            { ingredientId: ingMilkId, qtyDelta: 0 },
          ],
        },
        {
          name: "Large",
          priceDeltaCents: 3000,
          ingredients: [
            { ingredientId: ingBeansId, qtyDelta: 8 },
            { ingredientId: ingMilkId, qtyDelta: 100 },
          ],
        },
      ],
      addOns: [],
      ingredients: [
        { ingredientId: ingBeansId, qty: 18 },
        { ingredientId: ingMilkId, qty: 150 },
      ],
    });
    menuItemId = item.id;
    smallSizeId = item.sizes.find((s) => s.name === "Small")!.id;
    largeSizeId = item.sizes.find((s) => s.name === "Large")!.id;
  });

  it("N parallel createOrder produces consecutive dailyNumbers and deducts stock without drift", async () => {
    const N = 5;
    const initialBeans = (await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!;
    const initialBeansStock = toDec(initialBeans.stockQty);

    const promises = Array.from({ length: N }).map((_, i) =>
      createOrder({
        customerName: `Parallel Customer ${i}`,
        paymentMethod: "CASH",
        items: [
          {
            menuItemId,
            sizeId: smallSizeId,
            quantity: 1, // 18g beans each
          },
        ],
      })
    );

    const createdOrders = await Promise.all(promises);

    expect(createdOrders.length).toBe(N);
    const numbers = createdOrders.map((o) => o.dailyNumber).sort((a, b) => a - b);
    // Consecutive numbers
    for (let i = 0; i < N; i++) {
      expect(numbers[i]).toBe(numbers[0] + i);
    }

    const updatedBeans = (await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!;
    const expectedStock = initialBeansStock.minus(18 * N);
    expect(toDec(updatedBeans.stockQty).toString()).toBe(expectedStock.toString());
  });

  it("verifies native ON CONFLICT SQL in DailyCounter upsert", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const loggedQueries: string[] = [];
    const clientWithLogging = new PrismaClient({
      log: [
        {
          emit: "event",
          level: "query",
        },
      ],
    });

    (clientWithLogging as any).$on("query", (e: any) => {
      loggedQueries.push(e.query);
    });

    const day = "2026-12-31";
    await clientWithLogging.dailyCounter.upsert({
      where: { businessDay: day },
      create: { businessDay: day, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    await clientWithLogging.$disconnect();

    const upsertQuery = loggedQueries.find(
      (q) => q.toLowerCase().includes("dailycounter") && q.toLowerCase().includes("conflict")
    );
    expect(upsertQuery).toBeDefined();
    expect(upsertQuery?.toLowerCase()).toContain("on conflict");
  });

  it("Double cancel: two concurrent DELETEs -> exactly one succeeds, the other gets 409", async () => {
    const order = await createOrder({
      customerName: "Double Cancel Test",
      paymentMethod: "CASH",
      items: [{ menuItemId, sizeId: smallSizeId, quantity: 1 }],
    });

    const beansBefore = toDec((await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!.stockQty);

    // Run two cancellations concurrently
    const [res1, res2] = await Promise.allSettled([
      cancelOrder(order.id),
      cancelOrder(order.id),
    ]);

    const successes = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejections = [res1, res2].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const rejectedError = (rejections[0] as PromiseRejectedResult).reason;
    expect(rejectedError).toBeInstanceOf(OrderServiceError);
    expect((rejectedError as OrderServiceError).statusCode).toBe(409);

    // Stock must be restored exactly once (18g)
    const beansAfter = toDec((await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!.stockQty);
    expect(beansAfter.minus(beansBefore).toNumber()).toBe(18);
  });

  it("Cancel READY without wasMade -> 400; with wasMade=false -> restored; with wasMade=true -> waste recorded and stock unchanged", async () => {
    // 1. Missing wasMade on READY order
    const order1 = await createOrder({
      customerName: "Ready Cancel 1",
      paymentMethod: "CASH",
      items: [{ menuItemId, sizeId: smallSizeId, quantity: 1 }],
    });
    await updateOrder(order1.id, { kind: "status", status: "READY" });

    await expect(cancelOrder(order1.id)).rejects.toThrowError(OrderServiceError);

    // 2. wasMade = false -> stock restored
    const beansBeforeFalse = toDec((await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!.stockQty);
    await cancelOrder(order1.id, { wasMade: false });
    const beansAfterFalse = toDec((await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!.stockQty);
    expect(beansAfterFalse.minus(beansBeforeFalse).toNumber()).toBe(18);

    // 3. wasMade = true -> stock NOT restored (net 0), WASTE recorded
    const order2 = await createOrder({
      customerName: "Ready Cancel 2",
      paymentMethod: "CASH",
      items: [{ menuItemId, sizeId: smallSizeId, quantity: 1 }],
    });
    await updateOrder(order2.id, { kind: "status", status: "READY" });

    const beansBeforeTrue = toDec((await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!.stockQty);
    await cancelOrder(order2.id, { wasMade: true });
    const beansAfterTrue = toDec((await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!.stockQty);
    expect(beansAfterTrue.toString()).toBe(beansBeforeTrue.toString()); // stock unchanged

    // Check waste movement created for beans
    const wasteMov = await prisma.stockMovement.findFirst({
      where: { orderId: order2.id, ingredientId: ingBeansId, reason: "WASTE" },
    });
    expect(wasteMov).not.toBeNull();
    expect(toDec(wasteMov!.qtyChange).toNumber()).toBe(-18);
  });

  it("Cancelling an old order without SALE rows produces no ledger rows and does not require wasMade", async () => {
    // Old orders have no stockMovements
    const oldOrder = await prisma.order.create({
      data: {
        dailyNumber: 999,
        paymentMethod: "CASH",
        totalPriceCents: 10000,
        status: "READY",
      },
    });

    const cancelled = await cancelOrder(oldOrder.id);
    expect(cancelled.status).toBe("CANCELLED");

    const movements = await prisma.stockMovement.findMany({ where: { orderId: oldOrder.id } });
    expect(movements.length).toBe(0);
  });

  it("Status PATCH to CANCELLED -> 400; modifications from CANCELLED -> 409", async () => {
    const order = await createOrder({
      paymentMethod: "CASH",
      items: [{ menuItemId, sizeId: smallSizeId, quantity: 1 }],
    });

    // Cannot patch status to CANCELLED
    await expect(
      updateOrder(order.id, { kind: "status", status: "CANCELLED" })
    ).rejects.toThrowError(OrderServiceError);

    // Cancel properly
    await cancelOrder(order.id);

    // Cannot advance or edit once CANCELLED
    await expect(
      updateOrder(order.id, { kind: "status", status: "READY" })
    ).rejects.toThrowError(OrderServiceError);

    await expect(
      updateOrder(order.id, {
        kind: "items",
        items: [{ menuItemId, sizeId: smallSizeId, quantity: 2 }],
      })
    ).rejects.toThrowError(OrderServiceError);
  });

  it("Deadlock scenario: two orders with overlapping ingredients succeed without deadlock", async () => {
    // Create an item that uses milk then beans, and another that uses beans then milk
    const promises = [
      createOrder({
        paymentMethod: "CASH",
        items: [{ menuItemId, sizeId: smallSizeId, quantity: 1 }],
      }),
      createOrder({
        paymentMethod: "CASH",
        items: [{ menuItemId, sizeId: largeSizeId, quantity: 2 }],
      }),
    ];

    const results = await Promise.all(promises);
    expect(results[0].id).toBeDefined();
    expect(results[1].id).toBeDefined();
  });

  it("Staff restock adds stock only, unitCostCents unchanged, costReview = PENDING", async () => {
    const ingBefore = (await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!;
    const stockBefore = toDec(ingBefore.stockQty);
    const costBefore = ingBefore.unitCostCents;

    const movement = await staffRestock(ingBeansId, {
      qty: 1000,
      reportedPaidCents: 60000, // 60 centavos/g
      note: "Staff bought bag of beans",
    });

    expect(movement.costReview).toBe("PENDING");
    expect(movement.reportedPaidCents).toBe(60000);

    const ingAfter = (await prisma.ingredient.findUnique({ where: { id: ingBeansId } }))!;
    expect(toDec(ingAfter.stockQty).toString()).toBe(stockBefore.plus(1000).toString());
    expect(ingAfter.unitCostCents?.toString()).toBe(costBefore?.toString()); // Cost did NOT change!
  });

  it("Confirming cost review updates ingredient cost only if newer, stale confirmation does not overwrite", async () => {
    // 1. Create a restock with pending review
    const mov = await staffRestock(ingMilkId, {
      qty: 1000,
      reportedPaidCents: 9000, // 9 centavos/ml
    });

    // 2. Later admin restock updates cost to 12 centavos/ml
    await adminRestock(ingMilkId, {
      qty: 500,
      totalPaidCents: 6000, // 12 centavos/ml
    });

    // 3. Confirming the earlier staff review (mov.id) should NOT overwrite the newer 12c cost
    const confirmRes = await confirmCostReview(mov.id);
    expect(confirmRes.confirmed).toBe(true);
    expect(confirmRes.updatedIngredientCost).toBe(false); // Stale price did not overwrite newer!

    const milkNow = (await prisma.ingredient.findUnique({ where: { id: ingMilkId } }))!;
    expect(toDec(milkNow.unitCostCents!).toNumber()).toBe(12);
  });

  it("Archive ingredient blocked when used in recipes, allowed when unused", async () => {
    // ingBeansId is used in Flat White
    await expect(archiveIngredient(ingBeansId)).rejects.toThrowError(/Flat White/);

    // Create an unused ingredient
    const vanilla = await createIngredient({
      name: "Vanilla Extract",
      unit: "ML",
      initialStock: 100,
    });

    const archived = await archiveIngredient(vanilla.id);
    expect(archived.archivedAt).not.toBeNull();

    const unarchived = await unarchiveIngredient(vanilla.id);
    expect(unarchived.archivedAt).toBeNull();
  });

  it("reconcile() reports zero drift across all ingredients and movements", async () => {
    const res = await reconcile();
    expect(res.reconciled).toBe(true);
    expect(res.discrepancies.length).toBe(0);
  });
});
