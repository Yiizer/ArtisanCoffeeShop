/**
 * Seed script for the Coffee Shop Ordering System (v1 prototype).
 *
 * Seeds placeholder menu data only:
 *   - several categories
 *   - menu items with base prices in integer centavos
 *   - sizes with price deltas (centavos, may be negative)
 *   - add-ons with prices (centavos) and availability flags
 *
 * It intentionally seeds NO orders and NO staff/user/role accounts — this is a
 * no-auth prototype and orders are created at runtime through the app.
 *
 * All monetary values below are integer centavos (e.g. 15000 = ₱150.00).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedSize = { name: string; priceDeltaCents: number };
type SeedAddOn = { name: string; priceCents: number; available: boolean };
type SeedItem = {
  name: string;
  description?: string;
  basePriceCents: number;
  category: string;
  available: boolean;
  sizes: SeedSize[];
  addOns: SeedAddOn[];
};

// Common reusable size/add-on presets keep the placeholder data readable.
const drinkSizes: SeedSize[] = [
  { name: "Small", priceDeltaCents: -1500 },
  { name: "Medium", priceDeltaCents: 0 },
  { name: "Large", priceDeltaCents: 2000 },
];

const drinkAddOns: SeedAddOn[] = [
  { name: "Extra Shot", priceCents: 3000, available: true },
  { name: "Oat Milk", priceCents: 2500, available: true },
  { name: "Vanilla Syrup", priceCents: 2000, available: true },
  { name: "Whipped Cream", priceCents: 1500, available: false },
];

const menuItems: SeedItem[] = [
  // --- Espresso ---
  {
    name: "Espresso",
    description: "A concentrated single shot of our house blend.",
    basePriceCents: 9000,
    category: "Espresso",
    available: true,
    sizes: [
      { name: "Single", priceDeltaCents: 0 },
      { name: "Double", priceDeltaCents: 2500 },
    ],
    addOns: [{ name: "Extra Shot", priceCents: 3000, available: true }],
  },
  {
    name: "Cappuccino",
    description: "Espresso with steamed milk and a thick layer of foam.",
    basePriceCents: 13000,
    category: "Espresso",
    available: true,
    sizes: drinkSizes,
    addOns: drinkAddOns,
  },
  {
    name: "Caramel Macchiato",
    description: "Vanilla, steamed milk, espresso, and caramel drizzle.",
    basePriceCents: 16000,
    category: "Espresso",
    available: true,
    sizes: drinkSizes,
    addOns: drinkAddOns,
  },

  // --- Brewed Coffee ---
  {
    name: "House Drip Coffee",
    description: "Freshly brewed medium-roast drip coffee.",
    basePriceCents: 10000,
    category: "Brewed Coffee",
    available: true,
    sizes: drinkSizes,
    addOns: [
      { name: "Oat Milk", priceCents: 2500, available: true },
      { name: "Vanilla Syrup", priceCents: 2000, available: true },
    ],
  },
  {
    name: "Cold Brew",
    description: "Slow-steeped for 18 hours, smooth and low-acid.",
    basePriceCents: 14000,
    category: "Brewed Coffee",
    available: true,
    sizes: [
      { name: "Regular", priceDeltaCents: 0 },
      { name: "Large", priceDeltaCents: 2500 },
    ],
    addOns: [
      { name: "Extra Shot", priceCents: 3000, available: true },
      { name: "Sweet Cream", priceCents: 2000, available: true },
    ],
  },

  // --- Non-Coffee ---
  {
    name: "Matcha Latte",
    description: "Stone-ground matcha with steamed milk.",
    basePriceCents: 15000,
    category: "Non-Coffee",
    available: true,
    sizes: drinkSizes,
    addOns: [
      { name: "Oat Milk", priceCents: 2500, available: true },
      { name: "Honey", priceCents: 1500, available: true },
    ],
  },
  {
    name: "Hot Chocolate",
    description: "Rich dark chocolate steamed with milk.",
    basePriceCents: 13000,
    category: "Non-Coffee",
    available: false,
    sizes: drinkSizes,
    addOns: [{ name: "Whipped Cream", priceCents: 1500, available: true }],
  },

  // --- Pastries ---
  {
    name: "Butter Croissant",
    description: "Flaky, all-butter croissant baked fresh daily.",
    basePriceCents: 8500,
    category: "Pastries",
    available: true,
    sizes: [],
    addOns: [{ name: "Strawberry Jam", priceCents: 1000, available: true }],
  },
  {
    name: "Blueberry Muffin",
    description: "Loaded with wild blueberries.",
    basePriceCents: 9500,
    category: "Pastries",
    available: true,
    sizes: [],
    addOns: [],
  },
];

async function main() {
  console.log("Seeding placeholder menu data...");

  // Idempotent-ish reset of menu content so re-running seed is safe in dev.
  // Cascades remove sizes/add-ons. Orders are never seeded here.
  await prisma.menuItem.deleteMany();

  for (const item of menuItems) {
    await prisma.menuItem.create({
      data: {
        name: item.name,
        description: item.description,
        basePriceCents: item.basePriceCents,
        category: item.category,
        available: item.available,
        sizes: { create: item.sizes },
        addOns: { create: item.addOns },
      },
    });
  }

  const count = await prisma.menuItem.count();
  console.log(`Seed complete: ${count} menu items created. No orders or staff accounts seeded.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
