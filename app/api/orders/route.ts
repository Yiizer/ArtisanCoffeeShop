// /api/orders route handler.
//   GET  → orders for the current Business_Day (used by live-queue polling).
//   POST → create an order with a server-computed total and dailyNumber.
// No authentication in this v1 prototype (see design's Security Considerations).

import { NextRequest, NextResponse } from "next/server";
import { createOrder, listOrders } from "@/lib/orders";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") ?? undefined;
    const orders = await listOrders(date);
    return NextResponse.json(orders);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const order = await createOrder(body);
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
