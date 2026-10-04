// PATCH /api/admin/ingredients/[id] — Update ingredient details.

import { NextRequest, NextResponse } from "next/server";
import { updateIngredient, type UpdateIngredientInput } from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin();
    const { id } = await context.params;
    const body: UpdateIngredientInput = await request.json();
    const updated = await updateIngredient(id, body, user.id);
    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
