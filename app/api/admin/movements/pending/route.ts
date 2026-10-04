// GET /api/admin/movements/pending — List pending price confirmations for review queue.

import { NextRequest, NextResponse } from "next/server";
import { listPendingCostReviews } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const pending = await listPendingCostReviews();
    return NextResponse.json(pending);
  } catch (err) {
    return toErrorResponse(err);
  }
}
