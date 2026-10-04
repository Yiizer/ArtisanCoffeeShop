// /api/orders/[id] route handler.
//   PATCH  → status advancement, payment confirmation, or an items edit
//            (status to CANCELLED rejected with 400; modifications from CANCELLED rejected with 409).
//   DELETE → cancel the order (?wasMade=true|false for READY/COMPLETED orders).

import { NextRequest, NextResponse } from "next/server";
import {
  cancelOrder,
  updateOrder,
  OrderServiceError,
  type OrderPatch,
  type CreateOrderItemInput,
} from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";
import { toErrorResponse } from "@/lib/apiError";
import { requireAuth } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function toOrderPatch(body: unknown): OrderPatch {
  if (body == null || typeof body !== "object") {
    throw new OrderServiceError(400, "Missing patch payload.");
  }
  const b = body as Record<string, unknown>;

  const kind = b.kind;
  if (kind === "status") {
    return { kind: "status", status: b.status as OrderStatus };
  }
  if (kind === "payment") {
    return {
      kind: "payment",
      isPaid: true,
      paymentRef: (b.paymentRef as string | undefined) ?? null,
    };
  }
  if (kind === "items") {
    return {
      kind: "items",
      items: (b.items as CreateOrderItemInput[] | undefined) ?? [],
    };
  }

  // Inference fallback for clients that omit `kind`.
  if ("items" in b) {
    return {
      kind: "items",
      items: (b.items as CreateOrderItemInput[] | undefined) ?? [],
    };
  }
  if ("status" in b) {
    return { kind: "status", status: b.status as OrderStatus };
  }
  if ("isPaid" in b) {
    return {
      kind: "payment",
      isPaid: true,
      paymentRef: (b.paymentRef as string | undefined) ?? null,
    };
  }

  throw new OrderServiceError(
    400,
    "Patch must specify a status, payment (isPaid), or items change."
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth(request);
    const { id } = await context.params;
    const body = await request.json();
    const patch = toOrderPatch(body);
    const order = await updateOrder(id, patch, user.id);
    return NextResponse.json(order);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth(request);
    const { id } = await context.params;
    const wasMadeParam = request.nextUrl.searchParams.get("wasMade");
    const wasMade =
      wasMadeParam === "true" ? true : wasMadeParam === "false" ? false : undefined;

    const order = await cancelOrder(id, { wasMade, cancelledById: user.id });
    return NextResponse.json(order);
  } catch (err) {
    return toErrorResponse(err);
  }
}
