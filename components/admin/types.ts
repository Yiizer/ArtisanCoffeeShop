// Client-side shapes for the Admin page, mirroring what the API routes return.
// Kept local to the admin UI to avoid importing server/Prisma types into the
// browser bundle. All monetary values are integer centavos.

export type AdminMenuSize = {
  id: string;
  name: string;
  priceDeltaCents: number;
};

export type AdminMenuAddOn = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
};

export type AdminMenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  basePriceCents: number;
  available: boolean;
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
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    notes: string | null;
    menuItem: { name: string };
    size: { name: string } | null;
    addOns: { addOn: { name: string } }[];
  }[];
};
