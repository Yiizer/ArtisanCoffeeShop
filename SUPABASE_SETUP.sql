-- ==============================================================================
-- ARTISAN COFFEE SHOP - Idempotent Database Setup & Migration Script
-- Compatible with PostgreSQL / Supabase
-- Safe to run on BOTH brand new databases and existing databases (Idempotent)
-- ==============================================================================

-- 1. Create Enums (Idempotent)
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('STAFF', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'READY', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "IngredientUnit" AS ENUM ('G', 'ML', 'PC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MovementReason" AS ENUM ('OPENING', 'SALE', 'RETURN', 'RESTOCK', 'ADJUSTMENT', 'WASTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "CostReview" AS ENUM ('NONE', 'PENDING', 'CONFIRMED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'WAGES', 'UTILITIES', 'SUPPLIES', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure all enum values exist (in case enums were created previously with fewer values)
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GCASH'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "IngredientUnit" ADD VALUE IF NOT EXISTS 'G'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "IngredientUnit" ADD VALUE IF NOT EXISTS 'ML'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "IngredientUnit" ADD VALUE IF NOT EXISTS 'PC'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'OPENING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'SALE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'RETURN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'RESTOCK'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'ADJUSTMENT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MovementReason" ADD VALUE IF NOT EXISTS 'WASTE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "CostReview" ADD VALUE IF NOT EXISTS 'NONE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CostReview" ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CostReview" ADD VALUE IF NOT EXISTS 'CONFIRMED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CostReview" ADD VALUE IF NOT EXISTS 'DISMISSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'RENT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'WAGES'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'UTILITIES'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'SUPPLIES'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'OTHER'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 3. Create Tables (If Not Existing)
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "pin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" "IngredientUnit" NOT NULL,
    "stockQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCostCents" DECIMAL(14,4),
    "costUpdatedAt" TIMESTAMP(3),
    "costSourceMovementId" TEXT,
    "lowStockThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePriceCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "noIngredients" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MenuItemSize" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemSize_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MenuItemAddOn" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "noIngredients" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MenuItemAddOn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MenuItemIngredient" (
    "menuItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "MenuItemIngredient_pkey" PRIMARY KEY ("menuItemId","ingredientId")
);

CREATE TABLE IF NOT EXISTS "SizeIngredient" (
    "sizeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyDelta" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "SizeIngredient_pkey" PRIMARY KEY ("sizeId","ingredientId")
);

CREATE TABLE IF NOT EXISTS "AddOnIngredient" (
    "addOnId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "AddOnIngredient_pkey" PRIMARY KEY ("addOnId","ingredientId")
);

CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT NOT NULL,
    "businessDay" TEXT,
    "dailyNumber" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "customerName" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentRef" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "totalPriceCents" INTEGER NOT NULL,
    "costCents" INTEGER,
    "uncostedLines" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelWasMade" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "sizeId" TEXT,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "lineTotalCents" INTEGER,
    "costCents" INTEGER,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderItemAddOn" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,

    CONSTRAINT "OrderItemAddOn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockMovement" (
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

CREATE TABLE IF NOT EXISTS "DailyCounter" (
    "businessDay" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("businessDay")
);

CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL,
    "businessDay" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);


-- 4. Ensure New Columns Exist on Previously Created Tables
ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "category" TEXT;

ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "noIngredients" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MenuItemAddOn" ADD COLUMN IF NOT EXISTS "noIngredients" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "businessDay" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "costCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "uncostedLines" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelWasMade" BOOLEAN;

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "lineTotalCents" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "costCents" INTEGER;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pin" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'STAFF';


-- 5. Backfill businessDay for legacy orders without businessDay
UPDATE "Order"
SET "businessDay" = TO_CHAR("createdAt" - INTERVAL '2 hours', 'YYYY-MM-DD')
WHERE "businessDay" IS NULL;


-- 6. Create Indexes (Idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE INDEX IF NOT EXISTS "Ingredient_archivedAt_idx" ON "Ingredient"("archivedAt");
CREATE INDEX IF NOT EXISTS "Ingredient_category_idx" ON "Ingredient"("category");
CREATE INDEX IF NOT EXISTS "MenuItemIngredient_ingredientId_idx" ON "MenuItemIngredient"("ingredientId");
CREATE INDEX IF NOT EXISTS "SizeIngredient_ingredientId_idx" ON "SizeIngredient"("ingredientId");
CREATE INDEX IF NOT EXISTS "AddOnIngredient_ingredientId_idx" ON "AddOnIngredient"("ingredientId");
CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_reversesId_key" ON "StockMovement"("reversesId");
CREATE INDEX IF NOT EXISTS "StockMovement_ingredientId_createdAt_idx" ON "StockMovement"("ingredientId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_orderId_idx" ON "StockMovement"("orderId");
CREATE INDEX IF NOT EXISTS "StockMovement_reason_createdAt_idx" ON "StockMovement"("reason", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_costReview_idx" ON "StockMovement"("costReview");
CREATE INDEX IF NOT EXISTS "Expense_businessDay_idx" ON "Expense"("businessDay");
CREATE INDEX IF NOT EXISTS "MenuItem_category_idx" ON "MenuItem"("category");
CREATE INDEX IF NOT EXISTS "MenuItemSize_menuItemId_idx" ON "MenuItemSize"("menuItemId");
CREATE INDEX IF NOT EXISTS "MenuItemAddOn_menuItemId_idx" ON "MenuItemAddOn"("menuItemId");
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_businessDay_dailyNumber_key" ON "Order"("businessDay", "dailyNumber");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");
CREATE INDEX IF NOT EXISTS "OrderItem_sizeId_idx" ON "OrderItem"("sizeId");
CREATE INDEX IF NOT EXISTS "OrderItemAddOn_orderItemId_idx" ON "OrderItemAddOn"("orderItemId");
CREATE INDEX IF NOT EXISTS "OrderItemAddOn_addOnId_idx" ON "OrderItemAddOn"("addOnId");


-- 7. Add Foreign Key Constraints (Idempotent via pg_constraint checks)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuItemIngredient_menuItemId_fkey') THEN
        ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuItemIngredient_ingredientId_fkey') THEN
        ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SizeIngredient_sizeId_fkey') THEN
        ALTER TABLE "SizeIngredient" ADD CONSTRAINT "SizeIngredient_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "MenuItemSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SizeIngredient_ingredientId_fkey') THEN
        ALTER TABLE "SizeIngredient" ADD CONSTRAINT "SizeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AddOnIngredient_addOnId_fkey') THEN
        ALTER TABLE "AddOnIngredient" ADD CONSTRAINT "AddOnIngredient_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "MenuItemAddOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AddOnIngredient_ingredientId_fkey') THEN
        ALTER TABLE "AddOnIngredient" ADD CONSTRAINT "AddOnIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_ingredientId_fkey') THEN
        ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_orderId_fkey') THEN
        ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_reversesId_fkey') THEN
        ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuItemSize_menuItemId_fkey') THEN
        ALTER TABLE "MenuItemSize" ADD CONSTRAINT "MenuItemSize_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuItemAddOn_menuItemId_fkey') THEN
        ALTER TABLE "MenuItemAddOn" ADD CONSTRAINT "MenuItemAddOn_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_orderId_fkey') THEN
        ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_menuItemId_fkey') THEN
        ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_sizeId_fkey') THEN
        ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "MenuItemSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItemAddOn_orderItemId_fkey') THEN
        ALTER TABLE "OrderItemAddOn" ADD CONSTRAINT "OrderItemAddOn_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItemAddOn_addOnId_fkey') THEN
        ALTER TABLE "OrderItemAddOn" ADD CONSTRAINT "OrderItemAddOn_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "MenuItemAddOn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;


-- 8. Register Prisma Migration record (so Prisma CLI knows rev 4 is already applied)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations') THEN
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        VALUES (
            md5(random()::text || clock_timestamp()::text),
            'd9737e6f85e3cb1639d48fc8e178a94625b50d996160105faef3e53e6b7d1591',
            NOW(),
            '20261004103200_inventory_costing_profit',
            NULL,
            NULL,
            NOW(),
            1
        )
        ON CONFLICT ("migration_name") DO NOTHING;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- 9. Default Admin Account (Optional / Idempotent)
-- Username: admin | Password: password123 | PIN: 1234
INSERT INTO "User" ("id", "username", "passwordHash", "name", "role", "pin", "updatedAt")
VALUES (
    'admin-default-id',
    'admin',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Admin User',
    'ADMIN',
    '1234',
    NOW()
)
ON CONFLICT ("username") DO NOTHING;
