// GET /api/admin/inventory/reconcile — Check ledger invariant (Ingredient.stockQty == Σ StockMovement.qtyChange).

import { NextRequest, NextResponse } from "next/server";
import { reconcile } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const result = await reconcile();
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
