// POST /api/inventory/movements — Staff-facing restock or waste recording.
// Only RESTOCK and WASTE are permitted here. Anything else returns 403.

import { NextRequest, NextResponse } from "next/server";
import { staffRestock, staffWaste } from "@/lib/inventory";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();

    const { ingredientId, reason, qty, reportedPaidCents, note } = body;
    if (!ingredientId) {
      return NextResponse.json({ error: "ingredientId is required." }, { status: 400 });
    }
    if (qty === undefined || qty === null) {
      return NextResponse.json({ error: "qty is required." }, { status: 400 });
    }

    if (reason === "RESTOCK") {
      const movement = await staffRestock(
        ingredientId,
        { qty, reportedPaidCents, note },
        user.id
      );
      return NextResponse.json(movement, { status: 201 });
    }

    if (reason === "WASTE") {
      const movement = await staffWaste(ingredientId, qty, note, user.id);
      return NextResponse.json(movement, { status: 201 });
    }

    return NextResponse.json(
      { error: "Staff can only record RESTOCK or WASTE movements." },
      { status: 403 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
