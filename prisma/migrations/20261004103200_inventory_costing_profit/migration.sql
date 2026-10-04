-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('G', 'ML', 'PC');

-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('OPENING', 'SALE', 'RETURN', 'RESTOCK', 'ADJUSTMENT', 'WASTE');

-- CreateEnum
CREATE TYPE "CostReview" AS ENUM ('NONE', 'PENDING', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'WAGES', 'UTILITIES', 'SUPPLIES', 'OTHER');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "noIngredients" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MenuItemAddOn" ADD COLUMN     "noIngredients" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "businessDay" TEXT,
ADD COLUMN     "cancelWasMade" BOOLEAN,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "costCents" INTEGER,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "uncostedLines" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "costCents" INTEGER,
ADD COLUMN     "lineTotalCents" INTEGER;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "pin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "stockQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCostCents" DECIMAL(14,4),
    "costUpdatedAt" TIMESTAMP(3),
    "costSourceMovementId" TEXT,
    "lowStockThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemIngredient" (
    "menuItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "MenuItemIngredient_pkey" PRIMARY KEY ("menuItemId","ingredientId")
);

-- CreateTable
CREATE TABLE "SizeIngredient" (
    "sizeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyDelta" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "SizeIngredient_pkey" PRIMARY KEY ("sizeId","ingredientId")
);

-- CreateTable
CREATE TABLE "AddOnIngredient" (
    "addOnId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "AddOnIngredient_pkey" PRIMARY KEY ("addOnId","ingredientId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyChange" DECIMAL(14,3) NOT NULL,
    "unitCostCents" DECIMAL(14,4),
    "reason" "MovementReason" NOT NULL,
    "orderId" TEXT,
    "reversesId" TEXT,
    "reportedPaidCents" INTEGER,
    "costReview" "CostReview" NOT NULL DEFAULT 'NONE',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCounter" (
    "businessDay" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("businessDay")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessDay" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Ingredient_archivedAt_idx" ON "Ingredient"("archivedAt");

-- CreateIndex
CREATE INDEX "MenuItemIngredient_ingredientId_idx" ON "MenuItemIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "SizeIngredient_ingredientId_idx" ON "SizeIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "AddOnIngredient_ingredientId_idx" ON "AddOnIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversesId_key" ON "StockMovement"("reversesId");

-- CreateIndex
CREATE INDEX "StockMovement_ingredientId_createdAt_idx" ON "StockMovement"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- CreateIndex
CREATE INDEX "StockMovement_reason_createdAt_idx" ON "StockMovement"("reason", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_costReview_idx" ON "StockMovement"("costReview");

-- CreateIndex
CREATE INDEX "Expense_businessDay_idx" ON "Expense"("businessDay");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessDay_dailyNumber_key" ON "Order"("businessDay", "dailyNumber");

-- AddForeignKey
ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeIngredient" ADD CONSTRAINT "SizeIngredient_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "MenuItemSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeIngredient" ADD CONSTRAINT "SizeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnIngredient" ADD CONSTRAINT "AddOnIngredient_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "MenuItemAddOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnIngredient" ADD CONSTRAINT "AddOnIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
