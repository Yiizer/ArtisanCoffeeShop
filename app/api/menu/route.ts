// /api/menu route handler (Requirements 2.1, 2.2, 2.7, 2.8).
//
// This route is intentionally NOT behind authentication (v1 prototype).
//   GET  -> full menu with sizes + add-ons
//   POST -> validate and create a menu item; 400 on invalid input.

import { NextResponse } from "next/server";
import {
  listMenu,
  createMenuItem,
  MenuValidationError,
  type MenuItemInput,
} from "@/lib/menu";

export const dynamic = "force-dynamic";

export async function GET() {
  const menu = await listMenu();
  return NextResponse.json(menu, { status: 200 });
}

export async function POST(request: Request) {
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
