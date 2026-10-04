// GET /api/admin/movements — List stock movement history.

import { NextRequest, NextResponse } from "next/server";
import { listMovements } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";
import type { MovementReason } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const ingredientId = request.nextUrl.searchParams.get("ingredientId") ?? undefined;
    const reason = (request.nextUrl.searchParams.get("reason") as MovementReason) ?? undefined;
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const movements = await listMovements({ ingredientId, reason, limit });
    return NextResponse.json(movements);
  } catch (err) {
    return toErrorResponse(err);
  }
}
