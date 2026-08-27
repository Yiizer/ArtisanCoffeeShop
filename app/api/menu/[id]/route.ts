// /api/menu/[id] route handler (Requirements 2.3, 2.4, 2.5, 2.6).
//
// This route is intentionally NOT behind authentication (v1 prototype).
//   PATCH  -> update item/sizes/add-ons, or toggle item / add-on availability.
//   DELETE -> remove the item; sizes and add-ons cascade away.
//
// Note: in Next.js 15 the dynamic route context `params` is async and must be
// awaited.

import { NextResponse } from "next/server";
import {
  updateMenuItem,
  deleteMenuItem,
  setItemAvailability,
  setAddOnAvailability,
  MenuValidationError,
  type MenuItemInput,
} from "@/lib/menu";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH body variants:
 *  - { toggleAddOn: { addOnId, available } } -> toggle a single add-on.
 *  - { available: boolean } (alone)          -> toggle the whole item.
 *  - Partial<MenuItemInput>                   -> general item/sizes/add-ons update.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;

  try {
    // Targeted add-on availability toggle (Requirement 2.6).
    if (patch.toggleAddOn !== undefined) {
      const toggle = patch.toggleAddOn as Record<string, unknown>;
      if (
        typeof toggle.addOnId !== "string" ||
        typeof toggle.available !== "boolean"
      ) {
        return NextResponse.json(
          { error: "toggleAddOn requires { addOnId: string, available: boolean }." },
          { status: 400 }
        );
      }
      const addOn = await setAddOnAvailability(toggle.addOnId, toggle.available);
      return NextResponse.json(addOn, { status: 200 });
    }

    // Item availability toggle when `available` is the only field (Req 2.5).
    const keys = Object.keys(patch);
    if (keys.length === 1 && keys[0] === "available") {
      if (typeof patch.available !== "boolean") {
        return NextResponse.json(
          { error: "available must be a boolean." },
          { status: 400 }
        );
      }
      const item = await setItemAvailability(id, patch.available);
      return NextResponse.json(item, { status: 200 });
    }

    // General update of item/sizes/add-ons (Requirement 2.3).
    const item = await updateMenuItem(id, patch as Partial<MenuItemInput>);
    return NextResponse.json(item, { status: 200 });
  } catch (error) {
    if (error instanceof MenuValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await deleteMenuItem(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/menu/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete menu item." },
      { status: 500 }
    );
  }
}
