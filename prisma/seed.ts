/**
 * Seed script for the Coffee Shop Ordering & Inventory System.
 * Seeds menu items, ingredients with stock & costs, recipes, and default accounts.
 */
import { PrismaClient, UserRole, IngredientUnit, MovementReason } from "@prisma/client";
import { hashPassword } from "../lib/auth";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding users...");
  const adminPassHash = await hashPassword("admin123");
  const cashierPassHash = await hashPassword("cashier123");

  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: adminPassHash,
      name: "Store Manager",
      role: UserRole.ADMIN,
      pin: "8888",
    },
    create: {
      username: "admin",
      passwordHash: adminPassHash,
      name: "Store Manager",
      role: UserRole.ADMIN,
      pin: "8888",
    },
  });

  await prisma.user.upsert({
    where: { username: "cashier" },
    update: {
      passwordHash: cashierPassHash,
      name: "Front Cashier",
      role: UserRole.STAFF,
      pin: "1234",
    },
    create: {
      username: "cashier",
      passwordHash: cashierPassHash,
      name: "Front Cashier",
      role: UserRole.STAFF,
      pin: "1234",
    },
  });

  console.log("Seeding ingredients and opening stock...");
  const ingredientData = [
    { name: "Espresso Beans", category: "Coffee", unit: IngredientUnit.G, stock: 10000, cost: 1.5, low: 2000 },
    { name: "Whole Milk", category: "Dairy", unit: IngredientUnit.ML, stock: 20000, cost: 0.12, low: 4000 },
    { name: "Oat Milk", category: "Dairy", unit: IngredientUnit.ML, stock: 10000, cost: 0.20, low: 2000 },
    { name: "Vanilla Syrup", category: "Syrups", unit: IngredientUnit.ML, stock: 3000, cost: 0.40, low: 500 },
    { name: "Caramel Sauce", category: "Syrups", unit: IngredientUnit.ML, stock: 2000, cost: 0.50, low: 400 },
    { name: "Matcha Powder", category: "Tea & Powders", unit: IngredientUnit.G, stock: 1000, cost: 2.50, low: 200 },
    { name: "Dark Chocolate", category: "Syrups & Sauce", unit: IngredientUnit.G, stock: 2000, cost: 1.80, low: 300 },
    { name: "Fresh Croissants", category: "Bakery", unit: IngredientUnit.PC, stock: 24, cost: 4500, low: 6 },
    { name: "Fresh Muffins", category: "Bakery", unit: IngredientUnit.PC, stock: 20, cost: 5000, low: 5 },
  ];

  const ingredientMap = new Map<string, string>();

  for (const ing of ingredientData) {
    let row = await prisma.ingredient.findFirst({ where: { name: ing.name } });
    if (!row) {
      row = await prisma.ingredient.create({
        data: {
          name: ing.name,
          category: ing.category,
          unit: ing.unit,
          stockQty: ing.stock,
          unitCostCents: ing.cost,
          lowStockThreshold: ing.low,
          movements: {
            create: {
              qtyChange: ing.stock,
              unitCostCents: ing.cost,
              reason: MovementReason.OPENING,
              note: "Opening inventory stock",
              createdById: adminUser.id,
            },
          },
        },
      });
    } else if (!row.category) {
      row = await prisma.ingredient.update({
        where: { id: row.id },
        data: { category: ing.category },
      });
    }
    ingredientMap.set(ing.name, row.id);
  }

  console.log("Seeding menu items & recipes...");
  const drinkSizes = [
    { name: "Small", priceDeltaCents: -1500 },
    { name: "Medium", priceDeltaCents: 0 },
    { name: "Large", priceDeltaCents: 2000 },
  ];

  const drinkAddOns = [
    { name: "Extra Shot", priceCents: 3000, available: true },
    { name: "Oat Milk", priceCents: 2500, available: true },
    { name: "Vanilla Syrup", priceCents: 2000, available: true },
  ];

  const menuItems = [
    {
      name: "Espresso",
      description: "A concentrated single shot of our house blend.",
      basePriceCents: 9000,
      category: "Espresso",
      available: true,
      noIngredients: false,
      ingredients: [{ name: "Espresso Beans", qty: 18 }],
      sizes: [
        { name: "Single", priceDeltaCents: 0, deltas: [] },
        { name: "Double", priceDeltaCents: 2500, deltas: [{ name: "Espresso Beans", qtyDelta: 18 }] },
      ],
      addOns: [{ name: "Extra Shot", priceCents: 3000, available: true, ingName: "Espresso Beans", qty: 18 }],
    },
    {
      name: "Cappuccino",
      description: "Espresso with steamed milk and a thick layer of foam.",
      basePriceCents: 13000,
      category: "Espresso",
      available: true,
      noIngredients: false,
      ingredients: [
        { name: "Espresso Beans", qty: 18 },
        { name: "Whole Milk", qty: 180 },
      ],
      sizes: [
        { name: "Small", priceDeltaCents: -1500, deltas: [{ name: "Whole Milk", qtyDelta: -40 }] },
        { name: "Medium", priceDeltaCents: 0, deltas: [] },
        { name: "Large", priceDeltaCents: 2000, deltas: [{ name: "Whole Milk", qtyDelta: 80 }] },
      ],
      addOns: [
        { name: "Extra Shot", priceCents: 3000, available: true, ingName: "Espresso Beans", qty: 18 },
        { name: "Oat Milk", priceCents: 2500, available: true, ingName: "Oat Milk", qty: 180 },
        { name: "Vanilla Syrup", priceCents: 2000, available: true, ingName: "Vanilla Syrup", qty: 20 },
      ],
    },
    {
      name: "Caramel Macchiato",
      description: "Vanilla, steamed milk, espresso, and caramel drizzle.",
      basePriceCents: 16000,
      category: "Espresso",
      available: true,
      noIngredients: false,
      ingredients: [
        { name: "Espresso Beans", qty: 18 },
        { name: "Whole Milk", qty: 200 },
        { name: "Vanilla Syrup", qty: 20 },
        { name: "Caramel Sauce", qty: 15 },
      ],
      sizes: [
        { name: "Small", priceDeltaCents: -1500, deltas: [{ name: "Whole Milk", qtyDelta: -40 }] },
        { name: "Medium", priceDeltaCents: 0, deltas: [] },
        { name: "Large", priceDeltaCents: 2000, deltas: [{ name: "Whole Milk", qtyDelta: 80 }] },
      ],
      addOns: [
        { name: "Extra Shot", priceCents: 3000, available: true, ingName: "Espresso Beans", qty: 18 },
        { name: "Oat Milk", priceCents: 2500, available: true, ingName: "Oat Milk", qty: 200 },
      ],
    },
    {
      name: "Matcha Latte",
      description: "Stone-ground matcha with steamed milk.",
      basePriceCents: 15000,
      category: "Non-Coffee",
      available: true,
      noIngredients: false,
      ingredients: [
        { name: "Matcha Powder", qty: 10 },
        { name: "Whole Milk", qty: 200 },
      ],
      sizes: [
        { name: "Small", priceDeltaCents: -1500, deltas: [{ name: "Whole Milk", qtyDelta: -40 }] },
        { name: "Medium", priceDeltaCents: 0, deltas: [] },
        { name: "Large", priceDeltaCents: 2000, deltas: [{ name: "Whole Milk", qtyDelta: 80 }] },
      ],
      addOns: [
        { name: "Oat Milk", priceCents: 2500, available: true, ingName: "Oat Milk", qty: 200 },
      ],
    },
    {
      name: "Butter Croissant",
      description: "Flaky, all-butter croissant baked fresh daily.",
      basePriceCents: 8500,
      category: "Pastries",
      available: true,
      noIngredients: false,
      ingredients: [{ name: "Fresh Croissants", qty: 1 }],
      sizes: [],
      addOns: [],
    },
    {
      name: "Blueberry Muffin",
      description: "Loaded with wild blueberries.",
      basePriceCents: 9500,
      category: "Pastries",
      available: true,
      noIngredients: false,
      ingredients: [{ name: "Fresh Muffins", qty: 1 }],
      sizes: [],
      addOns: [],
    },
  ];

  for (const item of menuItems) {
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          name: item.name,
          description: item.description,
          basePriceCents: item.basePriceCents,
          category: item.category,
          available: item.available,
          noIngredients: item.noIngredients,
          ingredients: {
            create: item.ingredients.map((ing) => ({
              ingredientId: ingredientMap.get(ing.name)!,
              qty: ing.qty,
            })),
          },
          sizes: {
            create: item.sizes.map((s) => ({
              name: s.name,
              priceDeltaCents: s.priceDeltaCents,
              ingredients: {
                create: s.deltas.map((d) => ({
                  ingredientId: ingredientMap.get(d.name)!,
                  qtyDelta: d.qtyDelta,
                })),
              },
            })),
          },
          addOns: {
            create: item.addOns.map((a) => ({
              name: a.name,
              priceCents: a.priceCents,
              available: a.available,
              ingredients: a.ingName
                ? {
                    create: {
                      ingredientId: ingredientMap.get(a.ingName)!,
                      qty: a.qty,
                    },
                  }
                : undefined,
            })),
          },
        },
      });
    }
  }

  const ingCount = await prisma.ingredient.count();
  const menuCount = await prisma.menuItem.count();
  const userCount = await prisma.user.count();
  console.log(`Seed completed: ${ingCount} ingredients, ${menuCount} menu items, and ${userCount} users.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
