// Inventory Service: ingredient management, stock movements, and review queue.
//
// Rules (§4.1, §4.4):
// - Stock updates and movements commit atomically in the same transaction
// - Append-only movements (except cost review status updates)
// - Staff restocks add stock only; pending price confirmed by admin
// - Reconcile check compares stockQty with sum(qtyChange)

import { Prisma, IngredientUnit, MovementReason, CostReview } from "@prisma/client";
import prisma from "./db";
import { toDec, toPrismaDec, roundToCentavos } from "./decimal";
import { Decimal } from "decimal.js";

export class InventoryServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

export type CreateIngredientInput = {
  name: string;
  unit: IngredientUnit;
  unitCostCents?: number | string | null;
  initialStock?: number | string;
  lowStockThreshold?: number | string;
};

export type UpdateIngredientInput = {
  name?: string;
  unit?: IngredientUnit;
  unitCostCents?: number | string | null;
  lowStockThreshold?: number | string;
};

export type StaffRestockInput = {
  qty: number | string;
  reportedPaidCents?: number | null;
  note?: string | null;
};

export type AdminRestockInput = {
  qty: number | string;
  totalPaidCents?: number | null;
  note?: string | null;
};

export type AdjustInput = {
  reason: "ADJUSTMENT" | "WASTE";
  qtyChange: number | string;
  note?: string | null;
};

/**
 * List ingredients for staff view (no cost data).
 */
export async function listIngredientsForStaff() {
  const ingredients = await prisma.ingredient.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });

  return ingredients.map((ing) => {
    const stock = toDec(ing.stockQty);
    const lowThresh = toDec(ing.lowStockThreshold);
    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      stockQty: stock.toString(),
      lowStockThreshold: lowThresh.toString(),
      isLowStock: stock.lessThanOrEqualTo(lowThresh) && stock.greaterThan(0),
      isOutOfStock: stock.lessThanOrEqualTo(0),
    };
  });
}

/**
 * List all ingredients for admin view (including costs and archive status).
 */
export async function listIngredientsForAdmin(includeArchived = false) {
  const ingredients = await prisma.ingredient.findMany({
    where: includeArchived ? undefined : { archivedAt: null },
    orderBy: [{ archivedAt: "desc" }, { name: "asc" }],
  });

  return ingredients.map((ing) => {
    const stock = toDec(ing.stockQty);
    const lowThresh = toDec(ing.lowStockThreshold);
    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      stockQty: stock.toString(),
      unitCostCents: ing.unitCostCents ? ing.unitCostCents.toString() : null,
      costUpdatedAt: ing.costUpdatedAt,
      costSourceMovementId: ing.costSourceMovementId,
      lowStockThreshold: lowThresh.toString(),
      archivedAt: ing.archivedAt,
      isLowStock: stock.lessThanOrEqualTo(lowThresh) && stock.greaterThan(0),
      isOutOfStock: stock.lessThanOrEqualTo(0),
    };
  });
}

/**
 * Create an ingredient (Admin only).
 * Can set initial cost and opening stock.
 */
export async function createIngredient(
  input: CreateIngredientInput,
  actingUserId?: string | null
) {
  if (!input.name || !input.name.trim()) {
    throw new InventoryServiceError(400, "Ingredient name is required.");
  }
  if (!["G", "ML", "PC"].includes(input.unit)) {
    throw new InventoryServiceError(400, "Invalid ingredient unit (must be G, ML, or PC).");
  }

  const initialStock = input.initialStock ? toDec(input.initialStock) : new Decimal(0);
  const unitCost = input.unitCostCents !== undefined && input.unitCostCents !== null
    ? toDec(input.unitCostCents)
    : null;
  const lowThresh = input.lowStockThreshold ? toDec(input.lowStockThreshold) : new Decimal(0);

  return prisma.$transaction(async (tx) => {
    const ingredient = await tx.ingredient.create({
      data: {
        name: input.name.trim(),
        unit: input.unit,
        stockQty: toPrismaDec(initialStock),
        unitCostCents: unitCost ? toPrismaDec(unitCost) : null,
        costUpdatedAt: unitCost ? new Date() : null,
        lowStockThreshold: toPrismaDec(lowThresh),
      },
    });

    if (!initialStock.isZero()) {
      await tx.stockMovement.create({
        data: {
          ingredientId: ingredient.id,
          qtyChange: toPrismaDec(initialStock),
          unitCostCents: unitCost ? toPrismaDec(unitCost) : null,
          reason: "OPENING",
          note: "Initial stock upon ingredient creation",
          createdById: actingUserId ?? null,
        },
      });
    }

    return ingredient;
  });
}

/**
 * Update ingredient details (Admin only).
 */
export async function updateIngredient(
  id: string,
  input: UpdateIngredientInput,
  actingUserId?: string | null
) {
  const existing = await prisma.ingredient.findUnique({ where: { id } });
  if (!existing) {
    throw new InventoryServiceError(404, `Ingredient not found: ${id}.`);
  }

  const data: Prisma.IngredientUpdateInput = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new InventoryServiceError(400, "Name cannot be empty.");
    data.name = input.name.trim();
  }
  if (input.unit !== undefined) {
    if (!["G", "ML", "PC"].includes(input.unit)) {
      throw new InventoryServiceError(400, "Invalid ingredient unit.");
    }
    data.unit = input.unit;
  }
  if (input.lowStockThreshold !== undefined) {
    data.lowStockThreshold = toPrismaDec(toDec(input.lowStockThreshold));
  }
  if (input.unitCostCents !== undefined) {
    if (input.unitCostCents === null) {
      data.unitCostCents = null;
      data.costUpdatedAt = new Date();
      data.costSourceMovementId = null;
    } else {
      const cost = toDec(input.unitCostCents);
      if (cost.isNegative()) {
        throw new InventoryServiceError(400, "Unit cost cannot be negative.");
      }
      data.unitCostCents = toPrismaDec(cost);
      data.costUpdatedAt = new Date();
      data.costSourceMovementId = null;
    }
  }

  return prisma.ingredient.update({
    where: { id },
    data,
  });
}

/**
 * Archive an ingredient. Blocked if used in any recipe.
 */
export async function archiveIngredient(id: string) {
  const existing = await prisma.ingredient.findUnique({
    where: { id },
    include: {
      menuItemIngredients: { include: { menuItem: true } },
      sizeIngredients: { include: { size: { include: { menuItem: true } } } },
      addOnIngredients: { include: { addOn: { include: { menuItem: true } } } },
    },
  });
  if (!existing) {
    throw new InventoryServiceError(404, `Ingredient not found: ${id}.`);
  }

  const referencingItems = new Set<string>();
  existing.menuItemIngredients.forEach((m) => referencingItems.add(m.menuItem.name));
  existing.sizeIngredients.forEach((s) => referencingItems.add(s.size.menuItem.name));
  existing.addOnIngredients.forEach((a) => referencingItems.add(a.addOn.menuItem.name));

  if (referencingItems.size > 0) {
    throw new InventoryServiceError(
      400,
      `Cannot archive ingredient: used in recipes for ${Array.from(referencingItems).join(", ")}.`
    );
  }

  return prisma.ingredient.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
}

/**
 * Unarchive an ingredient.
 */
export async function unarchiveIngredient(id: string) {
  return prisma.ingredient.update({
    where: { id },
    data: { archivedAt: null },
  });
}

/**
 * Staff restock: Adds stock only.
 * Optional reportedPaidCents is stored with costReview = PENDING for admin review.
 * Ingredient unitCostCents does NOT change.
 */
export async function staffRestock(
  ingredientId: string,
  input: StaffRestockInput,
  actingUserId?: string | null
) {
  const qty = toDec(input.qty);
  if (qty.lessThanOrEqualTo(0)) {
    throw new InventoryServiceError(400, "Restock quantity must be > 0.");
  }

  return prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new InventoryServiceError(404, `Ingredient not found: ${ingredientId}.`);

    const hasPaid = input.reportedPaidCents !== undefined && input.reportedPaidCents !== null;

    const movement = await tx.stockMovement.create({
      data: {
        ingredientId,
        qtyChange: toPrismaDec(qty),
        unitCostCents: null, // Staff restock does not set frozen unit cost
        reportedPaidCents: hasPaid ? input.reportedPaidCents : null,
        costReview: hasPaid ? CostReview.PENDING : CostReview.NONE,
        reason: MovementReason.RESTOCK,
        note: input.note ?? null,
        createdById: actingUserId ?? null,
      },
    });

    await tx.ingredient.update({
      where: { id: ingredientId },
      data: {
        stockQty: { increment: toPrismaDec(qty) },
      },
    });

    return movement;
  });
}

/**
 * Admin restock: Adds stock and updates unit cost if total paid is supplied.
 */
export async function adminRestock(
  ingredientId: string,
  input: AdminRestockInput,
  actingUserId?: string | null
) {
  const qty = toDec(input.qty);
  if (qty.lessThanOrEqualTo(0)) {
    throw new InventoryServiceError(400, "Restock quantity must be > 0.");
  }

  return prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new InventoryServiceError(404, `Ingredient not found: ${ingredientId}.`);

    let unitCost: Decimal | null = null;
    if (input.totalPaidCents !== undefined && input.totalPaidCents !== null) {
      if (input.totalPaidCents < 0) {
        throw new InventoryServiceError(400, "Total paid cannot be negative.");
      }
      unitCost = toDec(input.totalPaidCents).dividedBy(qty);
    }

    const movement = await tx.stockMovement.create({
      data: {
        ingredientId,
        qtyChange: toPrismaDec(qty),
        unitCostCents: unitCost ? toPrismaDec(unitCost) : null,
        reportedPaidCents: input.totalPaidCents ?? null,
        costReview: CostReview.CONFIRMED,
        reviewedById: actingUserId ?? null,
        reviewedAt: new Date(),
        reason: MovementReason.RESTOCK,
        note: input.note ?? null,
        createdById: actingUserId ?? null,
      },
    });

    await tx.ingredient.update({
      where: { id: ingredientId },
      data: {
        stockQty: { increment: toPrismaDec(qty) },
        ...(unitCost
          ? {
              unitCostCents: toPrismaDec(unitCost),
              costUpdatedAt: new Date(),
              costSourceMovementId: movement.id,
            }
          : {}),
      },
    });

    return movement;
  });
}

/**
 * Staff record waste (deduct stock, frozen at current ingredient cost).
 */
export async function staffWaste(
  ingredientId: string,
  qty: number | string,
  note?: string | null,
  actingUserId?: string | null
) {
  const decQty = toDec(qty);
  if (decQty.lessThanOrEqualTo(0)) {
    throw new InventoryServiceError(400, "Waste quantity must be > 0.");
  }

  return prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new InventoryServiceError(404, `Ingredient not found: ${ingredientId}.`);

    const movement = await tx.stockMovement.create({
      data: {
        ingredientId,
        qtyChange: toPrismaDec(decQty.negated()),
        unitCostCents: ing.unitCostCents,
        reason: MovementReason.WASTE,
        note: note ?? null,
        createdById: actingUserId ?? null,
      },
    });

    await tx.ingredient.update({
      where: { id: ingredientId },
      data: {
        stockQty: { decrement: toPrismaDec(decQty) },
      },
    });

    return movement;
  });
}

/**
 * Admin adjust stock (ADJUSTMENT or WASTE).
 */
export async function adminAdjust(
  ingredientId: string,
  input: AdjustInput,
  actingUserId?: string | null
) {
  const qtyChange = toDec(input.qtyChange);
  if (qtyChange.isZero()) {
    throw new InventoryServiceError(400, "Quantity change cannot be zero.");
  }
  if (input.reason === "WASTE" && qtyChange.greaterThan(0)) {
    throw new InventoryServiceError(400, "Waste quantity change must be negative.");
  }

  return prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new InventoryServiceError(404, `Ingredient not found: ${ingredientId}.`);

    const movement = await tx.stockMovement.create({
      data: {
        ingredientId,
        qtyChange: toPrismaDec(qtyChange),
        unitCostCents: ing.unitCostCents,
        reason: input.reason === "WASTE" ? MovementReason.WASTE : MovementReason.ADJUSTMENT,
        note: input.note ?? null,
        createdById: actingUserId ?? null,
      },
    });

    await tx.ingredient.update({
      where: { id: ingredientId },
      data: {
        stockQty: { increment: toPrismaDec(qtyChange) },
      },
    });

    return movement;
  });
}

/**
 * Admin confirm cost review for a restock movement.
 * Updates ingredient cost ONLY IF ingredient.costUpdatedAt IS NULL OR < movement.createdAt.
 */
export async function confirmCostReview(
  movementId: string,
  options?: { editUnitCostCents?: number | string | null },
  actingUserId?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.findUnique({
      where: { id: movementId },
      include: { ingredient: true },
    });
    if (!movement) {
      throw new InventoryServiceError(404, `Movement not found: ${movementId}.`);
    }
    if (movement.costReview !== CostReview.PENDING) {
      throw new InventoryServiceError(400, "Movement is not pending review.");
    }

    let unitCost: Decimal;
    if (options?.editUnitCostCents !== undefined && options.editUnitCostCents !== null) {
      unitCost = toDec(options.editUnitCostCents);
    } else if (movement.reportedPaidCents && toDec(movement.qtyChange).greaterThan(0)) {
      unitCost = toDec(movement.reportedPaidCents).dividedBy(toDec(movement.qtyChange));
    } else {
      throw new InventoryServiceError(400, "No valid cost provided to confirm.");
    }

    // 1. Mark movement confirmed
    await tx.stockMovement.update({
      where: { id: movementId },
      data: {
        unitCostCents: toPrismaDec(unitCost),
        costReview: CostReview.CONFIRMED,
        reviewedById: actingUserId ?? null,
        reviewedAt: new Date(),
      },
    });

    // 2. Guarded update on ingredient
    const updateResult = await tx.ingredient.updateMany({
      where: {
        id: movement.ingredientId,
        OR: [
          { costUpdatedAt: null },
          { costUpdatedAt: { lt: movement.createdAt } },
        ],
      },
      data: {
        unitCostCents: toPrismaDec(unitCost),
        costUpdatedAt: movement.createdAt,
        costSourceMovementId: movement.id,
      },
    });

    return {
      confirmed: true,
      updatedIngredientCost: updateResult.count > 0,
      unitCostCents: unitCost.toString(),
    };
  });
}

/**
 * Admin dismiss cost review.
 */
export async function dismissCostReview(
  movementId: string,
  actingUserId?: string | null
) {
  const movement = await prisma.stockMovement.findUnique({ where: { id: movementId } });
  if (!movement) throw new InventoryServiceError(404, `Movement not found: ${movementId}.`);
  if (movement.costReview !== CostReview.PENDING) {
    throw new InventoryServiceError(400, "Movement is not pending review.");
  }

  return prisma.stockMovement.update({
    where: { id: movementId },
    data: {
      costReview: CostReview.DISMISSED,
      reviewedById: actingUserId ?? null,
      reviewedAt: new Date(),
    },
  });
}

/**
 * List pending price confirmations for admin queue.
 */
export async function listPendingCostReviews() {
  const movements = await prisma.stockMovement.findMany({
    where: { costReview: CostReview.PENDING },
    include: { ingredient: true },
    orderBy: { createdAt: "desc" },
  });

  return movements.map((m) => {
    const qty = toDec(m.qtyChange);
    const paid = m.reportedPaidCents ?? 0;
    const reportedUnitCost = qty.greaterThan(0) ? toDec(paid).dividedBy(qty) : new Decimal(0);
    const currentUnitCost = m.ingredient.unitCostCents ? toDec(m.ingredient.unitCostCents) : null;

    let pctChange: number | null = null;
    if (currentUnitCost && !currentUnitCost.isZero()) {
      pctChange = reportedUnitCost.minus(currentUnitCost).dividedBy(currentUnitCost).times(100).toNumber();
    }

    return {
      movementId: m.id,
      ingredientId: m.ingredient.id,
      ingredientName: m.ingredient.name,
      unit: m.ingredient.unit,
      qty: qty.toString(),
      reportedPaidCents: m.reportedPaidCents,
      reportedUnitCostCents: reportedUnitCost.toString(),
      currentUnitCostCents: currentUnitCost ? currentUnitCost.toString() : null,
      pctChange,
      createdAt: m.createdAt,
      createdById: m.createdById,
    };
  });
}

/**
 * List movements with filtering.
 */
export async function listMovements(filter?: {
  ingredientId?: string;
  reason?: MovementReason;
  limit?: number;
}) {
  return prisma.stockMovement.findMany({
    where: {
      ingredientId: filter?.ingredientId,
      reason: filter?.reason,
    },
    include: { ingredient: true },
    orderBy: { createdAt: "desc" },
    take: filter?.limit ?? 100,
  });
}

/**
 * Reconcile stock quantities against the sum of stock movements.
 * Invariant: Ingredient.stockQty == Σ StockMovement.qtyChange
 */
export async function reconcile() {
  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, name: true, stockQty: true },
  });

  const discrepancies: {
    ingredientId: string;
    name: string;
    stockQty: string;
    movementSum: string;
    drift: string;
  }[] = [];

  for (const ing of ingredients) {
    const agg = await prisma.stockMovement.aggregate({
      where: { ingredientId: ing.id },
      _sum: { qtyChange: true },
    });

    const stock = toDec(ing.stockQty);
    const sum = toDec(agg._sum.qtyChange ?? 0);
    const drift = stock.minus(sum);

    if (!drift.isZero()) {
      discrepancies.push({
        ingredientId: ing.id,
        name: ing.name,
        stockQty: stock.toString(),
        movementSum: sum.toString(),
        drift: drift.toString(),
      });
    }
  }

  return {
    reconciled: discrepancies.length === 0,
    discrepancies,
  };
}
