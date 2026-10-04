// Pure recipe costing, ingredient usage, and availability arithmetic.
//
// All calculations use decimal.js via `lib/decimal.ts`.
// Rounding is ROUND_HALF_UP to whole centavos per order line.

import { Decimal } from "decimal.js";
import { toDec, roundToCentavos } from "./decimal";

export type IngredientInfo = {
  id: string;
  name: string;
  unit: string;
  stockQty: string | number | Decimal;
  unitCostCents: string | number | Decimal | null;
  lowStockThreshold?: string | number | Decimal;
  archivedAt?: Date | string | null;
};

export type RecipeIngredient = {
  ingredientId: string;
  qty: string | number | Decimal; // base units
};

export type SizeRecipeIngredient = {
  ingredientId: string;
  qtyDelta: string | number | Decimal; // may be negative
};

export type MenuItemCostInput = {
  id: string;
  name: string;
  basePriceCents: number;
  noIngredients?: boolean;
  ingredients: RecipeIngredient[];
  sizes: {
    id: string;
    name: string;
    priceDeltaCents: number;
    ingredients?: SizeRecipeIngredient[];
  }[];
  addOns: {
    id: string;
    name: string;
    priceCents: number;
    noIngredients?: boolean;
    ingredients?: RecipeIngredient[];
  }[];
};

export type LineSelection = {
  menuItemId: string;
  sizeId?: string | null;
  addOnIds?: string[];
  quantity: number;
  lineTotalCents: number;
};

export type IngredientRequirement = {
  ingredientId: string;
  qty: Decimal; // positive requirement for 1 unit of product
};

/**
 * Compute the required ingredient amounts for a single unit of an item + size + add-ons.
 * Applies: required[ing] = max(0, baseQty[ing] + sizeDelta[ing])
 */
export function computeItemUnitRequirements(
  item: MenuItemCostInput,
  sizeId?: string | null,
  addOnIds: string[] = []
): Map<string, Decimal> {
  const reqs = new Map<string, Decimal>();

  if (!item.noIngredients) {
    for (const ing of item.ingredients) {
      reqs.set(ing.ingredientId, toDec(ing.qty));
    }
  }

  if (sizeId) {
    const size = item.sizes.find((s) => s.id === sizeId);
    if (size && size.ingredients) {
      for (const sIng of size.ingredients) {
        const base = reqs.get(sIng.ingredientId) ?? new Decimal(0);
        const delta = toDec(sIng.qtyDelta);
        const combined = Decimal.max(0, base.plus(delta));
        reqs.set(sIng.ingredientId, combined);
      }
    }
  }

  // Add-ons
  for (const addOnId of addOnIds) {
    const addOn = item.addOns.find((a) => a.id === addOnId);
    if (addOn && !addOn.noIngredients && addOn.ingredients) {
      for (const aIng of addOn.ingredients) {
        const current = reqs.get(aIng.ingredientId) ?? new Decimal(0);
        reqs.set(aIng.ingredientId, current.plus(toDec(aIng.qty)));
      }
    }
  }

  return reqs;
}

/**
 * Check if a line's cost is fully known.
 * Returns true iff:
 * 1. The base has recipe lines OR noIngredients === true
 * 2. Every selected add-on has recipe lines OR noIngredients === true
 * 3. Every ingredient involved has a non-null unitCostCents
 */
export function isLineCostKnown(
  item: MenuItemCostInput,
  sizeId: string | null | undefined,
  addOnIds: string[] = [],
  ingredientCostMap: Map<string, Decimal | null>
): boolean {
  // 1. Base recipe check
  const baseHasRecipe = item.noIngredients || (item.ingredients && item.ingredients.length > 0);
  if (!baseHasRecipe) return false;

  // 2. Add-on recipe check
  for (const addOnId of addOnIds) {
    const addOn = item.addOns.find((a) => a.id === addOnId);
    if (!addOn) continue;
    const addOnHasRecipe = addOn.noIngredients || (addOn.ingredients && addOn.ingredients.length > 0);
    if (!addOnHasRecipe) return false;
  }

  // 3. Ingredient cost check
  const reqs = computeItemUnitRequirements(item, sizeId, addOnIds);
  for (const [ingId, qty] of reqs.entries()) {
    if (qty.isZero()) continue;
    const cost = ingredientCostMap.get(ingId);
    if (cost === null || cost === undefined) {
      return false;
    }
  }

  return true;
}

/**
 * Compute the cost in centavos for an order line.
 * Returns null if cost is not fully known.
 * Rounds to whole centavos per order line using ROUND_HALF_UP.
 */
export function computeLineCostCents(
  item: MenuItemCostInput,
  sizeId: string | null | undefined,
  addOnIds: string[] = [],
  quantity: number,
  ingredientCostMap: Map<string, Decimal | null>
): number | null {
  if (!isLineCostKnown(item, sizeId, addOnIds, ingredientCostMap)) {
    return null;
  }

  const reqs = computeItemUnitRequirements(item, sizeId, addOnIds);
  let unitCostCents = new Decimal(0);

  for (const [ingId, qty] of reqs.entries()) {
    if (qty.isZero()) continue;
    const ingUnitCost = ingredientCostMap.get(ingId)!;
    unitCostCents = unitCostCents.plus(qty.times(ingUnitCost));
  }

  const totalLineCost = unitCostCents.times(quantity);
  return roundToCentavos(totalLineCost);
}

/**
 * Compute total order cost and uncosted line count.
 * Order cost is Σ non-null line costs (or null if all lines are uncosted).
 */
export function computeOrderCost(lineCosts: (number | null)[]): {
  costCents: number | null;
  uncostedLines: number;
} {
  let total = 0;
  let uncostedCount = 0;
  let hasCostedLine = false;

  for (const cost of lineCosts) {
    if (cost === null) {
      uncostedCount++;
    } else {
      total += cost;
      hasCostedLine = true;
    }
  }

  return {
    costCents: hasCostedLine ? total : null,
    uncostedLines: uncostedCount,
  };
}

/**
 * Check availability of a size, item, and add-on against current stock quantities.
 * required[ing] = max(0, baseQty[ing] + sizeDelta[ing])
 */
export function checkAvailability(
  item: MenuItemCostInput,
  stockMap: Map<string, Decimal>
): {
  available: boolean;
  sizeAvailability: Map<string, boolean>;
  addOnAvailability: Map<string, boolean>;
} {
  const sizeAvailability = new Map<string, boolean>();
  const addOnAvailability = new Map<string, boolean>();

  // Check each add-on
  for (const addOn of item.addOns) {
    if (addOn.noIngredients || !addOn.ingredients || addOn.ingredients.length === 0) {
      addOnAvailability.set(addOn.id, true);
      continue;
    }
    let ok = true;
    for (const aIng of addOn.ingredients) {
      const stock = stockMap.get(aIng.ingredientId) ?? new Decimal(0);
      if (stock.lessThan(toDec(aIng.qty))) {
        ok = false;
        break;
      }
    }
    addOnAvailability.set(addOn.id, ok);
  }

  // Check sizes (or base item if no sizes)
  if (item.sizes.length === 0) {
    let ok = true;
    if (!item.noIngredients && item.ingredients) {
      for (const bIng of item.ingredients) {
        const stock = stockMap.get(bIng.ingredientId) ?? new Decimal(0);
        if (stock.lessThan(toDec(bIng.qty))) {
          ok = false;
          break;
        }
      }
    }
    return {
      available: ok,
      sizeAvailability,
      addOnAvailability,
    };
  }

  let atLeastOneSizeAvailable = false;
  for (const size of item.sizes) {
    const reqs = computeItemUnitRequirements(item, size.id, []);
    let sizeOk = true;
    for (const [ingId, reqQty] of reqs.entries()) {
      if (reqQty.isZero()) continue;
      const stock = stockMap.get(ingId) ?? new Decimal(0);
      if (stock.lessThan(reqQty)) {
        sizeOk = false;
        break;
      }
    }
    sizeAvailability.set(size.id, sizeOk);
    if (sizeOk) atLeastOneSizeAvailable = true;
  }

  return {
    available: atLeastOneSizeAvailable,
    sizeAvailability,
    addOnAvailability,
  };
}

/**
 * Find size deltas that reduce ingredient below 0 (negative delta warning).
 */
export function findNegativeDeltaWarnings(item: MenuItemCostInput): string[] {
  const warnings: string[] = [];
  if (item.noIngredients || !item.ingredients) return warnings;

  const baseMap = new Map<string, Decimal>();
  for (const ing of item.ingredients) {
    baseMap.set(ing.ingredientId, toDec(ing.qty));
  }

  for (const size of item.sizes) {
    if (!size.ingredients) continue;
    for (const sIng of size.ingredients) {
      const base = baseMap.get(sIng.ingredientId) ?? new Decimal(0);
      const delta = toDec(sIng.qtyDelta);
      if (base.plus(delta).isNegative()) {
        warnings.push(
          `${size.name}: delta ${delta.toString()} exceeds base ${base.toString()}, treated as 0`
        );
      }
    }
  }

  return warnings;
}
