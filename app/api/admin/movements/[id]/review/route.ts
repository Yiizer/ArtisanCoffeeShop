// POST /api/admin/movements/[id]/review — Confirm or dismiss a pending price review.

import { NextRequest, NextResponse } from "next/server";
import { confirmCostReview, dismissCostReview } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin(request);
    const { id } = await context.params;
    const body = await request.json();

    const { action, editUnitCostCents } = body;
    const act = typeof action === "string" ? action.toLowerCase() : "";

    if (act === "confirm") {
      const result = await confirmCostReview(
        id,
        { editUnitCostCents },
        user.id
      );
      return NextResponse.json(result);
    }

    if (act === "dismiss") {
      const result = await dismissCostReview(id, user.id);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid action. Must be 'confirm' or 'dismiss'." },
      { status: 400 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
