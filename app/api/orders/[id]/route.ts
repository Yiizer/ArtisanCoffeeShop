// /api/orders/[id] route handler.
//   PATCH  → status advancement, payment confirmation, or an items edit
//            (items edits past RECEIVED are rejected with 409 by the service).
//   DELETE → cancel the order (sets refunded when it was paid); the order stays
//            counted in daily numbering.
// In Next.js 15 App Router, dynamic route params are async and must be awaited.

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

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Derive the OrderPatch from a request body. An explicit `kind` is honored;
 * otherwise the shape is inferred from the fields present.
 */
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
    const { id } = await context.params;
    const body = await request.json();
    const patch = toOrderPatch(body);
    const order = await updateOrder(id, patch);
    return NextResponse.json(order);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const order = await cancelOrder(id);
    return NextResponse.json(order);
  } catch (err) {
    return toErrorResponse(err);
  }
}
