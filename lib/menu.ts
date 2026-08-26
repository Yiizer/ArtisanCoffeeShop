// Menu Service — reads and mutates menu items, sizes, and add-ons via Prisma.
//
// This is the persistence-backed counterpart to the pure helpers in
// lib/menuLogic.ts. All monetary values are integer centavos. Input validation
// lives here (and is exported) so the /api/menu route handlers can reuse it and
// return HTTP 400 on invalid input.

import prisma from "./db";

// --- Input shapes ---------------------------------------------------------

export type MenuSizeInput = {
  name: string;
  priceDeltaCents: number; // integer centavos, may be negative
};

export type MenuAddOnInput = {
  name: string;
  priceCents: number; // integer centavos, >= 0
  available?: boolean; // defaults to true
};

export type MenuItemInput = {
  name: string;
  description?: string;
  basePriceCents: number; // integer centavos, >= 0
  category: string;
  imageUrl?: string;
  available?: boolean; // defaults to true
  sizes: MenuSizeInput[];
  addOns: MenuAddOnInput[];
};

/**
 * Thrown when a menu payload fails validation. Route handlers catch this and
 * respond with HTTP 400 and the message as validation detail.
 */
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

/**
 * Validate a size sub-input: non-empty name and integer priceDeltaCents
 * (Requirement 2.7).
 */
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

/**
 * Validate an add-on sub-input: non-empty name and integer priceCents >= 0
 * (Requirement 2.8).
 */
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

/**
 * Validate a full or partial MenuItem input. When `partial` is true (used for
 * updates) only the fields that are present are validated; when false (used for
 * creates) name, category, basePriceCents, sizes and add-ons are all required.
 *
 * Enforces: non-empty name/category, integer basePriceCents >= 0
 * (Requirement 2.2), integer size priceDeltaCents (Requirement 2.7), integer
 * add-on priceCents >= 0 (Requirement 2.8).
 */
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

  // Sizes: required on create, optional on update; validate when present.
  if (!partial || i.sizes !== undefined) {
    if (!Array.isArray(i.sizes)) {
      throw new MenuValidationError("Menu item sizes must be an array.");
    }
    for (const size of i.sizes) {
      validateMenuSizeInput(size);
    }
  }

  // Add-ons: required on create, optional on update; validate when present.
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

const menuInclude = { sizes: true, addOns: true } as const;

// --- Service functions ----------------------------------------------------

/**
 * Return every menu item including its sizes and add-ons (Requirement 2.1).
 */
export function listMenu() {
  return prisma.menuItem.findMany({
    include: menuInclude,
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Validate and create a menu item with nested sizes and add-ons
 * (Requirements 2.2, 2.7, 2.8). Throws MenuValidationError on invalid input.
 */
export async function createMenuItem(input: MenuItemInput) {
  validateMenuItemInput(input, { partial: false });

  return prisma.menuItem.create({
    data: {
      name: input.name.trim(),
      description: input.description,
      basePriceCents: input.basePriceCents,
      category: input.category.trim(),
      imageUrl: input.imageUrl,
      available: input.available ?? true,
      sizes: {
        create: input.sizes.map((s) => ({
          name: s.name.trim(),
          priceDeltaCents: s.priceDeltaCents,
        })),
      },
      addOns: {
        create: input.addOns.map((a) => ({
          name: a.name.trim(),
          priceCents: a.priceCents,
          available: a.available ?? true,
        })),
      },
    },
    include: menuInclude,
  });
}

/**
 * Validate and apply a partial update to a menu item (Requirement 2.3). When
 * `sizes` or `addOns` arrays are supplied they fully replace the existing
 * variants (delete-then-create), which also covers add-on availability changes
 * when the full add-on set is provided.
 */
export async function updateMenuItem(id: string, input: Partial<MenuItemInput>) {
  validateMenuItemInput(input, { partial: true });

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description;
  if (input.basePriceCents !== undefined) data.basePriceCents = input.basePriceCents;
  if (input.category !== undefined) data.category = input.category.trim();
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.available !== undefined) data.available = input.available;

  if (input.sizes !== undefined) {
    data.sizes = {
      deleteMany: {},
      create: input.sizes.map((s) => ({
        name: s.name.trim(),
        priceDeltaCents: s.priceDeltaCents,
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
      })),
    };
  }

  return prisma.menuItem.update({
    where: { id },
    data,
    include: menuInclude,
  });
}

/**
 * Delete a menu item; the schema's onDelete: Cascade removes its sizes and
 * add-ons (Requirement 2.4).
 */
export async function deleteMenuItem(id: string): Promise<void> {
  await prisma.menuItem.delete({ where: { id } });
}

/**
 * Persist a new `available` flag on a whole MenuItem (Requirement 2.5).
 */
export function setItemAvailability(id: string, available: boolean) {
  return prisma.menuItem.update({
    where: { id },
    data: { available },
    include: menuInclude,
  });
}

/**
 * Persist a new `available` flag on a single MenuItemAddOn, independently of
 * the parent item's availability (Requirement 2.6, Property 7).
 */
export function setAddOnAvailability(addOnId: string, available: boolean) {
  return prisma.menuItemAddOn.update({
    where: { id: addOnId },
    data: { available },
  });
}
