// POST /api/admin/ingredients/[id]/movements — Admin restock (sets cost) or adjust/waste.

import { NextRequest, NextResponse } from "next/server";
import { adminRestock, adminAdjust } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();

    const { reason, qty, totalPaidCents, qtyChange, note } = body;

    if (reason === "RESTOCK") {
      const movement = await adminRestock(
        id,
        { qty, totalPaidCents, note },
        user.id
      );
      return NextResponse.json(movement, { status: 201 });
    }

    if (reason === "ADJUSTMENT" || reason === "WASTE") {
      const movement = await adminAdjust(
        id,
        { reason, qtyChange: qtyChange ?? qty, note },
        user.id
      );
      return NextResponse.json(movement, { status: 201 });
    }

    return NextResponse.json(
      { error: "Invalid movement reason. Must be RESTOCK, ADJUSTMENT, or WASTE." },
      { status: 400 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
