// /api/admin/ingredients route handler.
//   GET  → List all ingredients with cost and archive info
//   POST → Create a new ingredient

import { NextRequest, NextResponse } from "next/server";
import {
  listIngredientsForAdmin,
  createIngredient,
  type CreateIngredientInput,
} from "@/lib/inventory";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const ingredients = await listIngredientsForAdmin(includeArchived);
    return NextResponse.json(ingredients);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body: CreateIngredientInput = await request.json();
    const ingredient = await createIngredient(body, user.id);
    return NextResponse.json(ingredient, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
