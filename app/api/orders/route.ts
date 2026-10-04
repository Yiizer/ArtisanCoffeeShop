// /api/orders route handler.
//   GET  → orders for the current Business_Day (used by live-queue polling).
//   POST → create an order with a server-computed total, dailyNumber, and recipe deductions.

import { NextRequest, NextResponse } from "next/server";
import { createOrder, listOrders } from "@/lib/orders";
import { toErrorResponse } from "@/lib/apiError";
import { requireAuth } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const date = request.nextUrl.searchParams.get("date") ?? undefined;
    const orders = await listOrders(date);
    return NextResponse.json(orders);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const order = await createOrder({ ...body, createdById: user.id });
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
