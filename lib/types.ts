// Plain, framework-agnostic domain types for the pure business-logic layer.
//
// These types are intentionally decoupled from Prisma's generated types so the
// pure logic modules (and their property tests) never import the database
// client or the generated schema. Enum-like values are modeled as const objects
// with a matching string-union type.

export const OrderStatus = {
  PENDING: "PENDING",
  READY: "READY",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  CASH: "CASH",
  GCASH: "GCASH",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * A single order line resolved against menu data. All prices are integer
 * centavos. `sizeDeltaCents` is 0 when no size is selected; `addOnPricesCents`
 * holds the resolved price of each selected add-on.
 */
export type ResolvedOrderItem = {
  basePriceCents: number;
  sizeDeltaCents: number;
  addOnPricesCents: number[];
  quantity: number;
};

// --- Menu shapes (decoupled from the Prisma schema) -----------------------

export type MenuAddOn = {
  id: string;
  name: string;
  priceCents: number; // integer centavos, >= 0
  available: boolean;
};

export type MenuSize = {
  id: string;
  name: string;
  priceDeltaCents: number; // integer centavos, may be negative
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  basePriceCents: number; // integer centavos, >= 0
  available: boolean;
  sizes: MenuSize[];
  addOns: MenuAddOn[];
};
