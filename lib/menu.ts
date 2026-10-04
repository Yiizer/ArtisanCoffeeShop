// Menu Service — reads and mutates menu items, sizes, and add-ons via Prisma.
// Extended for Inventory & Costing:
// - Recipes for base items, sizes (qtyDelta), and add-ons
// - noIngredients flags
// - Availability computation from stock
// - Admin-only recipe and cost serialization

import { Prisma } from "@prisma/client";
import prisma from "./db";
import { checkAvailability, computeLineCostCents, type MenuItemCostInput } from "./costing";
import { toDec, toPrismaDec } from "./decimal";
import { Decimal } from "decimal.js";

// --- Input shapes ---------------------------------------------------------

export type RecipeItemInput = {
  ingredientId: string;
  qty: number | string;
};

export type SizeRecipeItemInput = {
  ingredientId: string;
  qtyDelta: number | string;
};

export type MenuSizeInput = {
  id?: string;
  name: string;
  priceDeltaCents: number; // integer centavos, may be negative
  ingredients?: SizeRecipeItemInput[];
};

export type MenuAddOnInput = {
  id?: string;
  name: string;
  priceCents: number; // integer centavos, >= 0
  available?: boolean; // defaults to true
  noIngredients?: boolean;
  ingredients?: RecipeItemInput[];
};

export type MenuItemInput = {
  name: string;
  description?: string;
  basePriceCents: number; // integer centavos, >= 0
  category: string;
  imageUrl?: string;
  available?: boolean; // defaults to true
  noIngredients?: boolean;
  sizes: MenuSizeInput[];
  addOns: MenuAddOnInput[];
  ingredients?: RecipeItemInput[];
};

export class MenuValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MenuValidationError";
  }
}

// --- Validation helpers ---------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function validateMenuSizeInput(size: unknown): asserts size is MenuSizeInput {
  if (typeof size !== "object" || size === null) {
    throw new MenuValidationError("Each size must be an object.");
  }
  const s = size as Record<string, unknown>;
  if (!isNonEmptyString(s.name)) {
    throw new MenuValidationError("Size name must be a non-empty string.");
  }
  if (!isInteger(s.priceDeltaCents)) {
    throw new MenuValidationError("Size priceDeltaCents must be an integer.");
  }
}

export function validateMenuAddOnInput(addOn: unknown): asserts addOn is MenuAddOnInput {
  if (typeof addOn !== "object" || addOn === null) {
    throw new MenuValidationError("Each add-on must be an object.");
  }
  const a = addOn as Record<string, unknown>;
  if (!isNonEmptyString(a.name)) {
    throw new MenuValidationError("Add-on name must be a non-empty string.");
  }
  if (!isInteger(a.priceCents) || (a.priceCents as number) < 0) {
    throw new MenuValidationError("Add-on priceCents must be an integer >= 0.");
  }
  if (a.available !== undefined && typeof a.available !== "boolean") {
    throw new MenuValidationError("Add-on available must be a boolean.");
  }
}

export function validateMenuItemInput(
  input: unknown,
  { partial = false }: { partial?: boolean } = {}
): void {
  if (typeof input !== "object" || input === null) {
    throw new MenuValidationError("Menu item payload must be an object.");
  }
  const i = input as Record<string, unknown>;

  const hasName = i.name !== undefined;
  const hasCategory = i.category !== undefined;
  const hasBasePrice = i.basePriceCents !== undefined;

  if ((!partial || hasName) && !isNonEmptyString(i.name)) {
    throw new MenuValidationError("Menu item name must be a non-empty string.");
  }
  if ((!partial || hasCategory) && !isNonEmptyString(i.category)) {
    throw new MenuValidationError("Menu item category must be a non-empty string.");
  }
  if (
    (!partial || hasBasePrice) &&
    (!isInteger(i.basePriceCents) || (i.basePriceCents as number) < 0)
  ) {
    throw new MenuValidationError("Menu item basePriceCents must be an integer >= 0.");
  }
  if (i.available !== undefined && typeof i.available !== "boolean") {
    throw new MenuValidationError("Menu item available must be a boolean.");
  }

  if (!partial || i.sizes !== undefined) {
    if (!Array.isArray(i.sizes)) {
      throw new MenuValidationError("Menu item sizes must be an array.");
    }
    for (const size of i.sizes) {
      validateMenuSizeInput(size);
    }
  }

  if (!partial || i.addOns !== undefined) {
    if (!Array.isArray(i.addOns)) {
      throw new MenuValidationError("Menu item addOns must be an array.");
    }
    for (const addOn of i.addOns) {
      validateMenuAddOnInput(addOn);
    }
  }
}

// --- Prisma include shape -------------------------------------------------

const fullMenuInclude = {
  sizes: {
    include: {
      ingredients: {
        include: { ingredient: true },
      },
    },
  },
  addOns: {
    include: {
      ingredients: {
        include: { ingredient: true },
      },
    },
  },
  ingredients: {
    include: { ingredient: true },
  },
} satisfies Prisma.MenuItemInclude;

// --- Service functions ----------------------------------------------------

/**
 * Return menu items with availability computed from current stock.
 * Costs and recipes are serialized ONLY for ADMIN.
 */
export async function listMenu(isAdmin = false) {
  const [items, ingredients] = await Promise.all([
    prisma.menuItem.findMany({
      include: fullMenuInclude,
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    }),
    prisma.ingredient.findMany({
      select: { id: true, stockQty: true, unitCostCents: true },
    }),
  ]);

  const stockMap = new Map<string, Decimal>();
  const costMap = new Map<string, Decimal | null>();
  for (const ing of ingredients) {
    stockMap.set(ing.id, toDec(ing.stockQty));
    costMap.set(ing.id, ing.unitCostCents ? toDec(ing.unitCostCents) : null);
  }

  return items.map((item) => {
    const costInput: MenuItemCostInput = {
      id: item.id,
      name: item.name,
      basePriceCents: item.basePriceCents,
      noIngredients: item.noIngredients,
      ingredients: item.ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        qty: i.qty,
      })),
      sizes: item.sizes.map((s) => ({
        id: s.id,
        name: s.name,
        priceDeltaCents: s.priceDeltaCents,
        ingredients: s.ingredients.map((si) => ({
          ingredientId: si.ingredientId,
          qtyDelta: si.qtyDelta,
        })),
      })),
      addOns: item.addOns.map((a) => ({
        id: a.id,
        name: a.name,
        priceCents: a.priceCents,
        noIngredients: a.noIngredients,
        ingredients: a.ingredients.map((ai) => ({
          ingredientId: ai.ingredientId,
          qty: ai.qty,
        })),
      })),
    };

    const avail = checkAvailability(costInput, stockMap);

    if (!isAdmin) {
      // Staff view: strip costs and recipe lines, provide inStock
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        basePriceCents: item.basePriceCents,
        category: item.category,
        imageUrl: item.imageUrl,
        available: item.available,
        inStock: item.available && avail.available,
        sizes: item.sizes.map((s) => ({
          id: s.id,
          name: s.name,
          priceDeltaCents: s.priceDeltaCents,
          inStock: item.available && (avail.sizeAvailability.get(s.id) ?? true),
        })),
        addOns: item.addOns.map((a) => ({
          id: a.id,
          name: a.name,
          priceCents: a.priceCents,
          available: a.available,
          inStock: a.available && (avail.addOnAvailability.get(a.id) ?? true),
        })),
      };
    }

    // Admin view: include recipes and cost calculation
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      basePriceCents: item.basePriceCents,
      category: item.category,
      imageUrl: item.imageUrl,
      available: item.available,
      noIngredients: item.noIngredients,
      inStock: item.available && avail.available,
      ingredients: item.ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        qty: i.qty.toString(),
        ingredient: {
          id: i.ingredient.id,
          name: i.ingredient.name,
          unit: i.ingredient.unit,
          unitCostCents: i.ingredient.unitCostCents ? i.ingredient.unitCostCents.toString() : null,
        },
      })),
      sizes: item.sizes.map((s) => {
        const sizeCost = computeLineCostCents(costInput, s.id, [], 1, costMap);
        const price = item.basePriceCents + s.priceDeltaCents;
        const marginPct = sizeCost !== null && price > 0 ? (price - sizeCost) / price : null;
        return {
          id: s.id,
          name: s.name,
          priceDeltaCents: s.priceDeltaCents,
          inStock: item.available && (avail.sizeAvailability.get(s.id) ?? true),
          costCents: sizeCost,
          marginPct,
          ingredients: s.ingredients.map((si) => ({
            ingredientId: si.ingredientId,
            qtyDelta: si.qtyDelta.toString(),
            ingredient: {
              id: si.ingredient.id,
              name: si.ingredient.name,
              unit: si.ingredient.unit,
            },
          })),
        };
      }),
      addOns: item.addOns.map((a) => {
        const addOnCost = computeLineCostCents(costInput, null, [a.id], 1, costMap);
        return {
          id: a.id,
          name: a.name,
          priceCents: a.priceCents,
          available: a.available,
          noIngredients: a.noIngredients,
          inStock: a.available && (avail.addOnAvailability.get(a.id) ?? true),
          costCents: addOnCost,
          ingredients: a.ingredients.map((ai) => ({
            ingredientId: ai.ingredientId,
            qty: ai.qty.toString(),
            ingredient: {
              id: ai.ingredient.id,
              name: ai.ingredient.name,
              unit: ai.ingredient.unit,
            },
          })),
        };
      }),
    };
  });
}

const menuInclude = { sizes: true, addOns: true } as const;

/**
 * Create a menu item with nested recipes.
 */
export async function createMenuItem(input: MenuItemInput) {
  validateMenuItemInput(input, { partial: false });

  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({
      data: {
        name: input.name.trim(),
        description: input.description,
        basePriceCents: input.basePriceCents,
        category: input.category.trim(),
        imageUrl: input.imageUrl,
        available: input.available ?? true,
        noIngredients: input.noIngredients ?? false,
        ingredients: {
          create: (input.ingredients ?? []).map((i) => ({
            ingredientId: i.ingredientId,
            qty: toPrismaDec(toDec(i.qty)),
          })),
        },
        sizes: {
          create: input.sizes.map((s) => ({
            name: s.name.trim(),
            priceDeltaCents: s.priceDeltaCents,
            ingredients: {
              create: (s.ingredients ?? []).map((si) => ({
                ingredientId: si.ingredientId,
                qtyDelta: toPrismaDec(toDec(si.qtyDelta)),
              })),
            },
          })),
        },
        addOns: {
          create: input.addOns.map((a) => ({
            name: a.name.trim(),
            priceCents: a.priceCents,
            available: a.available ?? true,
            noIngredients: a.noIngredients ?? false,
            ingredients: {
              create: (a.ingredients ?? []).map((ai) => ({
                ingredientId: ai.ingredientId,
                qty: toPrismaDec(toDec(ai.qty)),
              })),
            },
          })),
        },
      },
      include: menuInclude,
    });

    return item;
  });
}

/**
 * Update a menu item with recipes.
 */
export async function updateMenuItem(id: string, input: Partial<MenuItemInput>) {
  validateMenuItemInput(input, { partial: true });

  return prisma.$transaction(async (tx) => {
    const data: Prisma.MenuItemUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    if (input.basePriceCents !== undefined) data.basePriceCents = input.basePriceCents;
    if (input.category !== undefined) data.category = input.category.trim();
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.available !== undefined) data.available = input.available;
    if (input.noIngredients !== undefined) data.noIngredients = input.noIngredients;

    if (input.ingredients !== undefined) {
      data.ingredients = {
        deleteMany: {},
        create: input.ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          qty: toPrismaDec(toDec(i.qty)),
        })),
      };
    }

    if (input.sizes !== undefined) {
      data.sizes = {
        deleteMany: {},
        create: input.sizes.map((s) => ({
          name: s.name.trim(),
          priceDeltaCents: s.priceDeltaCents,
          ingredients: {
            create: (s.ingredients ?? []).map((si) => ({
              ingredientId: si.ingredientId,
              qtyDelta: toPrismaDec(toDec(si.qtyDelta)),
            })),
          },
        })),
      };
    }

    if (input.addOns !== undefined) {
      data.addOns = {
        deleteMany: {},
        create: input.addOns.map((a) => ({
          name: a.name.trim(),
          priceCents: a.priceCents,
          available: a.available ?? true,
          noIngredients: a.noIngredients ?? false,
          ingredients: {
            create: (a.ingredients ?? []).map((ai) => ({
              ingredientId: ai.ingredientId,
              qty: toPrismaDec(toDec(ai.qty)),
            })),
          },
        })),
      };
    }

    return tx.menuItem.update({
      where: { id },
      data,
      include: menuInclude,
    });
  });
}

export async function deleteMenuItem(
  id: string
): Promise<{ deleted: boolean; deactivated: boolean; message: string }> {
  try {
    await prisma.menuItem.delete({ where: { id } });
    return {
      deleted: true,
      deactivated: false,
      message: "Menu item permanently deleted.",
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "P2003" || err?.message?.includes("Foreign key constraint")) {
      await prisma.menuItem.update({
        where: { id },
        data: { available: false },
      });
      return {
        deleted: false,
        deactivated: true,
        message:
          "Item has existing order history; it has been deactivated and hidden from ordering.",
      };
    }
    throw error;
  }
}

export function setItemAvailability(id: string, available: boolean) {
  return prisma.menuItem.update({
    where: { id },
    data: { available },
    include: fullMenuInclude,
  });
}

export function setAddOnAvailability(addOnId: string, available: boolean) {
  return prisma.menuItemAddOn.update({
    where: { id: addOnId },
    data: { available },
  });
}
