// Client-side shapes for the Admin page, mirroring what the API routes return.

export type IngredientUnit = "G" | "ML" | "PC";

export type AdminIngredient = {
  id: string;
  name: string;
  unit: IngredientUnit;
  stockQty: string;
  unitCostCents: string | null;
  costUpdatedAt: string | null;
  costSourceMovementId: string | null;
  lowStockThreshold: string;
  archivedAt: string | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
};

export type PendingCostReview = {
  movementId: string;
  ingredientId: string;
  ingredientName: string;
  unit: IngredientUnit;
  qty: string;
  reportedPaidCents: number | null;
  reportedUnitCostCents: string;
  currentUnitCostCents: string | null;
  pctChange: number | null;
  createdAt: string;
  createdById: string | null;
};

export type AdminExpense = {
  id: string;
  businessDay: string;
  category: "RENT" | "WAGES" | "UTILITIES" | "SUPPLIES" | "OTHER";
  amountCents: number;
  note: string | null;
  createdById: string | null;
  createdAt: string;
};

export type AdminStockMovement = {
  id: string;
  ingredientId: string;
  qtyChange: string;
  unitCostCents: string | null;
  reason: "OPENING" | "SALE" | "RETURN" | "RESTOCK" | "ADJUSTMENT" | "WASTE";
  orderId: string | null;
  reportedPaidCents: number | null;
  costReview: "NONE" | "PENDING" | "CONFIRMED" | "DISMISSED";
  note: string | null;
  createdById: string | null;
  createdAt: string;
  ingredient: {
    name: string;
    unit: IngredientUnit;
  };
};

export type RecipeIngredient = {
  ingredientId: string;
  qty: string;
  ingredient?: {
    id: string;
    name: string;
    unit: IngredientUnit;
    unitCostCents: string | null;
  };
};

export type SizeRecipeIngredient = {
  ingredientId: string;
  qtyDelta: string;
  ingredient?: {
    id: string;
    name: string;
    unit: IngredientUnit;
  };
};

export type AdminMenuSize = {
  id: string;
  name: string;
  priceDeltaCents: number;
  costCents?: number | null;
  marginPct?: number | null;
  inStock?: boolean;
  ingredients?: SizeRecipeIngredient[];
};

export type AdminMenuAddOn = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  noIngredients?: boolean;
  costCents?: number | null;
  inStock?: boolean;
  ingredients?: RecipeIngredient[];
};

export type AdminMenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  basePriceCents: number;
  available: boolean;
  noIngredients?: boolean;
  inStock?: boolean;
  ingredients?: RecipeIngredient[];
  sizes: AdminMenuSize[];
  addOns: AdminMenuAddOn[];
};

export type SummaryView = "day" | "week" | "month";

export type DailyBreakdown = {
  date: string;
  orders: number;
  revenueCents: number;
};

export type Summary = {
  view: SummaryView;
  startDate: string;
  endDate: string;
  totalOrders: number;
  cancelledOrders: number;
  revenueCents: number;
  refundedCents: number;
  cashCents: number;
  gcashCents: number;
  costedRevenueCents: number;
  uncostedRevenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  marginPct: number | null;
  wasteCents: number;
  adjustmentsCents: number;
  unvaluedMovementCount: number;
  expensesCents: number;
  netProfitCents: number;
  dailyBreakdown: DailyBreakdown[];
};

export type OrderStatus =
  | "PENDING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentMethod = "CASH" | "GCASH";

export type AdminOrder = {
  id: string;
  dailyNumber: number;
  customerName: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentRef: string | null;
  isPaid: boolean;
  refunded: boolean;
  totalPriceCents: number;
  costCents?: number | null;
  uncostedLines?: number;
  hasStockUsage?: boolean;
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    notes: string | null;
    lineTotalCents?: number | null;
    costCents?: number | null;
    menuItem: { name: string };
    size: { name: string } | null;
    addOns: { addOn: { name: string } }[];
  }[];
};
