-- ==============================================================================
-- ARTISAN COFFEE SHOP - Database Setup Script
-- Run this in your Supabase SQL Editor
-- ==============================================================================

-- Migration 1: Initial Schema
-- ==============================================================================

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH');

-- CreateTable: MenuItem
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePriceCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MenuItemSize
CREATE TABLE "MenuItemSize" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MenuItemSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MenuItemAddOn
CREATE TABLE "MenuItemAddOn" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MenuItemAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Order
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "dailyNumber" INTEGER NOT NULL,
    "customerName" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentRef" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "totalPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrderItem
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "sizeId" TEXT,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrderItemAddOn
CREATE TABLE "OrderItemAddOn" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    CONSTRAINT "OrderItemAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "MenuItem_category_idx" ON "MenuItem"("category");
CREATE INDEX "MenuItemSize_menuItemId_idx" ON "MenuItemSize"("menuItemId");
CREATE INDEX "MenuItemAddOn_menuItemId_idx" ON "MenuItemAddOn"("menuItemId");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");
CREATE INDEX "OrderItem_sizeId_idx" ON "OrderItem"("sizeId");
CREATE INDEX "OrderItemAddOn_orderItemId_idx" ON "OrderItemAddOn"("orderItemId");
CREATE INDEX "OrderItemAddOn_addOnId_idx" ON "OrderItemAddOn"("addOnId");

-- AddForeignKeys
ALTER TABLE "MenuItemSize" ADD CONSTRAINT "MenuItemSize_menuItemId_fkey" 
    FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuItemAddOn" ADD CONSTRAINT "MenuItemAddOn_menuItemId_fkey" 
    FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" 
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" 
    FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sizeId_fkey" 
    FOREIGN KEY ("sizeId") REFERENCES "MenuItemSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItemAddOn" ADD CONSTRAINT "OrderItemAddOn_orderItemId_fkey" 
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItemAddOn" ADD CONSTRAINT "OrderItemAddOn_addOnId_fkey" 
    FOREIGN KEY ("addOnId") REFERENCES "MenuItemAddOn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Migration 2: Update OrderStatus Enum
-- ==============================================================================

-- AlterEnum: Change RECEIVED to PENDING, remove PREPARING
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'READY', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- ==============================================================================
-- ✅ Schema created successfully!
-- Next: Run the seed data SQL (see SUPABASE_SEED.sql)
-- ==============================================================================
