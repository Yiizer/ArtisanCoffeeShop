// /api/admin/expenses route handler.
//   GET  → List expenses for date range
//   POST → Create new expense

import { NextRequest, NextResponse } from "next/server";
import {
  listExpenses,
  createExpense,
  type CreateExpenseInput,
} from "@/lib/expenses";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const startDate = request.nextUrl.searchParams.get("startDate") ?? undefined;
    const endDate = request.nextUrl.searchParams.get("endDate") ?? undefined;

    const expenses = await listExpenses(startDate, endDate);
    return NextResponse.json(expenses);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body: CreateExpenseInput = await request.json();
    const expense = await createExpense(body, user.id);
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
