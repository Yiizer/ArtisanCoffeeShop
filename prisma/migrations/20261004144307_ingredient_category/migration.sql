-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");
