// /api/menu route handler.
//   GET  -> full menu with sizes + add-ons; costs only serialized for ADMIN role
//   POST -> validate and create a menu item (ADMIN only).

import { NextResponse } from "next/server";
import {
  listMenu,
  createMenuItem,
  MenuValidationError,
  type MenuItemInput,
} from "@/lib/menu";
import { getCurrentUser, requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  const isAdmin = user?.role === "ADMIN";
  const menu = await listMenu(isAdmin);
  return NextResponse.json(menu, { status: 200 });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const item = await createMenuItem(body as MenuItemInput);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof MenuValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
