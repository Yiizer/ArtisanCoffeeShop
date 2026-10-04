// /api/admin/expenses/[id] route handler.
//   PATCH  → Update expense
//   DELETE → Delete expense

import { NextRequest, NextResponse } from "next/server";
import {
  updateExpense,
  deleteExpense,
  type UpdateExpenseInput,
} from "@/lib/expenses";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body: UpdateExpenseInput = await request.json();
    const updated = await updateExpense(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const deleted = await deleteExpense(id);
    return NextResponse.json(deleted);
  } catch (err) {
    return toErrorResponse(err);
  }
}
