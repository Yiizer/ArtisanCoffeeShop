import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Decimal } from "decimal.js";
import {
  computeItemUnitRequirements,
  isLineCostKnown,
  computeLineCostCents,
  computeOrderCost,
  checkAvailability,
  findNegativeDeltaWarnings,
  type MenuItemCostInput,
} from "../lib/costing";
import { toDec, toPrismaDec, roundToCentavos } from "../lib/decimal";
import { aggregateSummary, type SummaryOrderRecord, type SummaryMovementRecord, type SummaryExpenseRecord } from "../lib/summaryLogic";
import { OrderStatus } from "../lib/types";

describe("Decimal boundary helper", () => {
  it("losslessly round-trips Decimal through toDec and toPrismaDec", () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        (n) => {
          const s = n.toString();
          const d1 = toDec(s);
          const pd = toPrismaDec(d1);
          const d2 = toDec(pd);
          expect(d1.toString()).toBe(d2.toString());
        }
      )
    );
  });

  it("rounds half up to whole centavos correctly", () => {
    expect(roundToCentavos("10.5")).toBe(11);
    expect(roundToCentavos("10.4")).toBe(10);
    expect(roundToCentavos("-10.5")).toBe(-11); // Away from zero
    expect(roundToCentavos("0")).toBe(0);
  });
});

describe("Costing pure logic", () => {
  const sampleItem: MenuItemCostInput = {
    id: "item-latte",
    name: "Latte",
    basePriceCents: 15000,
    noIngredients: false,
    ingredients: [
      { ingredientId: "ing-beans", qty: 18 },
      { ingredientId: "ing-milk", qty: 200 },
    ],
    sizes: [
      {
        id: "size-reg",
        name: "Regular",
        priceDeltaCents: 0,
        ingredients: [],
      },
      {
        id: "size-large",
        name: "Large",
        priceDeltaCents: 3000,
        ingredients: [
          { ingredientId: "ing-beans", qtyDelta: 9 },
          { ingredientId: "ing-milk", qtyDelta: 100 },
        ],
      },
      {
        id: "size-tiny",
        name: "Tiny",
        priceDeltaCents: -2000,
        ingredients: [
          { ingredientId: "ing-milk", qtyDelta: -250 }, // exceeds base 200!
        ],
      },
    ],
    addOns: [
      {
        id: "addon-syrup",
        name: "Vanilla Syrup",
        priceCents: 2000,
        noIngredients: false,
        ingredients: [{ ingredientId: "ing-syrup", qty: 20 }],
      },
      {
        id: "addon-empty",
        name: "No Recipe Addon",
        priceCents: 1000,
        noIngredients: false,
        ingredients: [],
      },
    ],
  };

  it("required is always >= 0, clamping negative deltas exceeding base", () => {
    const reqs = computeItemUnitRequirements(sampleItem, "size-tiny", []);
    expect(reqs.get("ing-milk")?.toNumber()).toBe(0); // 200 + (-250) = -50 -> clamped to 0
    expect(reqs.get("ing-beans")?.toNumber()).toBe(18);
  });

  it("warns about negative deltas exceeding base", () => {
    const warnings = findNegativeDeltaWarnings(sampleItem);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Tiny: delta -250 exceeds base 200, treated as 0");
  });

  it("cost is null iff a component has no recipe or uses a null-cost ingredient", () => {
    const costMap = new Map<string, Decimal | null>([
      ["ing-beans", new Decimal("0.5")], // ₱0.50 per g
      ["ing-milk", new Decimal("0.08")],  // ₱0.08 per ml
      ["ing-syrup", null],               // unknown cost!
    ]);

    // Regular latte: beans + milk known -> costed
    expect(isLineCostKnown(sampleItem, "size-reg", [], costMap)).toBe(true);
    const regCost = computeLineCostCents(sampleItem, "size-reg", [], 1, costMap);
    // 18 * 0.5 + 200 * 0.08 = 9 + 16 = 25 centavos
    expect(regCost).toBe(25);

    // With syrup: syrup cost is null -> line cost is null
    expect(isLineCostKnown(sampleItem, "size-reg", ["addon-syrup"], costMap)).toBe(false);
    expect(computeLineCostCents(sampleItem, "size-reg", ["addon-syrup"], 1, costMap)).toBeNull();

    // With empty addon: has no recipe and not noIngredients -> line cost is null
    expect(isLineCostKnown(sampleItem, "size-reg", ["addon-empty"], costMap)).toBe(false);
    expect(computeLineCostCents(sampleItem, "size-reg", ["addon-empty"], 1, costMap)).toBeNull();
  });

  it("order cost sums line costs and counts uncosted lines", () => {
    const res = computeOrderCost([25, null, 50]);
    expect(res.costCents).toBe(75);
    expect(res.uncostedLines).toBe(1);

    const allNull = computeOrderCost([null, null]);
    expect(allNull.costCents).toBeNull();
    expect(allNull.uncostedLines).toBe(2);
  });

  it("availability disables sizes and items when stock is insufficient", () => {
    const stockMap = new Map<string, Decimal>([
      ["ing-beans", new Decimal(20)], // enough for regular (18), not large (27)
      ["ing-milk", new Decimal(500)],
      ["ing-syrup", new Decimal(0)],
    ]);

    const avail = checkAvailability(sampleItem, stockMap);
    expect(avail.available).toBe(true); // at least regular is available
    expect(avail.sizeAvailability.get("size-reg")).toBe(true);
    expect(avail.sizeAvailability.get("size-large")).toBe(false); // 27 > 20
    expect(avail.addOnAvailability.get("addon-syrup")).toBe(false);
  });
});

describe("Profit and summary identities (Property-based)", () => {
  it("maintains profit identities: marginPct null iff costed revenue 0, net profit identity, revenue sum", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineTotalCents: fc.integer({ min: 100, max: 50000 }),
            costCents: fc.option(fc.integer({ min: 10, max: 40000 }), { nil: null }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.array(
          fc.record({
            reason: fc.constantFrom("WASTE" as const, "ADJUSTMENT" as const),
            qtyChange: fc.integer({ min: -100, max: 100 }),
            unitCostCents: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
          }),
          { maxLength: 5 }
        ),
        fc.array(
          fc.record({
            amountCents: fc.integer({ min: 0, max: 100000 }),
          }),
          { maxLength: 5 }
        ),
        (items, movements, expenses) => {
          const totalPriceCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
          const order: SummaryOrderRecord = {
            businessDay: "2026-10-04",
            status: OrderStatus.COMPLETED,
            isPaid: true,
            refunded: false,
            paymentMethod: "CASH",
            totalPriceCents,
            items,
          };

          const movRecords: SummaryMovementRecord[] = movements.map((m) => ({
            businessDay: "2026-10-04",
            reason: m.reason,
            qtyChange: m.qtyChange,
            unitCostCents: m.unitCostCents,
          }));

          const expRecords: SummaryExpenseRecord[] = expenses.map((e) => ({
            businessDay: "2026-10-04",
            amountCents: e.amountCents,
          }));

          const summary = aggregateSummary([order], movRecords, expRecords);

          // 1. costedRevenue + uncostedRevenue = revenue
          expect(summary.costedRevenueCents + summary.uncostedRevenueCents).toBe(summary.revenueCents);

          // 2. grossProfit = costedRevenue - cogs
          expect(summary.grossProfitCents).toBe(summary.costedRevenueCents - summary.cogsCents);

          // 3. marginPct is null iff costedRevenue is 0
          if (summary.costedRevenueCents === 0) {
            expect(summary.marginPct).toBeNull();
          } else {
            expect(summary.marginPct).toBeCloseTo(summary.grossProfitCents / summary.costedRevenueCents, 5);
          }

          // 4. netProfit = grossProfit - waste - adjustments - expenses
          expect(summary.netProfitCents).toBe(
            summary.grossProfitCents - summary.wasteCents - summary.adjustmentsCents - summary.expensesCents
          );
        }
      )
    );
  });
});
