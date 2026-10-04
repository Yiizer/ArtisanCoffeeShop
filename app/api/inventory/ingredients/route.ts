// GET /api/inventory/ingredients — Staff-facing ingredient list with stock levels (NO cost data).

import { NextRequest, NextResponse } from "next/server";
import { listIngredientsForStaff } from "@/lib/inventory";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const ingredients = await listIngredientsForStaff();
    return NextResponse.json(ingredients);
  } catch (err) {
    return toErrorResponse(err);
  }
}
