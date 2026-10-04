// POST /api/admin/ingredients/[id]/archive — Archive or unarchive ingredient.

import { NextRequest, NextResponse } from "next/server";
import { archiveIngredient, unarchiveIngredient } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const unarchive = body.unarchive === true;

    const result = unarchive ? await unarchiveIngredient(id) : await archiveIngredient(id);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
