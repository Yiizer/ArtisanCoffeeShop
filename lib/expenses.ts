// Expenses Service: manage business operational expenses.

import { ExpenseCategory } from "@prisma/client";
import prisma from "./db";
import { getBusinessDay } from "./businessDay";
import { isValidDateString } from "./summary";

export class ExpenseServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = "ExpenseServiceError";
  }
}

export type CreateExpenseInput = {
  businessDay?: string; // YYYY-MM-DD, defaults to getBusinessDay(now)
  category: ExpenseCategory;
  amountCents: number;
  note?: string | null;
};

export type UpdateExpenseInput = {
  businessDay?: string;
  category?: ExpenseCategory;
  amountCents?: number;
  note?: string | null;
};

export async function createExpense(
  input: CreateExpenseInput,
  actingUserId?: string | null
) {
  const businessDay = input.businessDay ?? getBusinessDay(new Date());
  if (!isValidDateString(businessDay)) {
    throw new ExpenseServiceError(400, "Invalid businessDay format. Must be YYYY-MM-DD.");
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    throw new ExpenseServiceError(400, "Expense amountCents must be an integer >= 0.");
  }

  const validCategories = Object.values(ExpenseCategory);
  if (!validCategories.includes(input.category)) {
    throw new ExpenseServiceError(400, `Invalid expense category: ${input.category}.`);
  }

  return prisma.expense.create({
    data: {
      businessDay,
      category: input.category,
      amountCents: input.amountCents,
      note: input.note ?? null,
      createdById: actingUserId ?? null,
    },
  });
}

export async function updateExpense(
  id: string,
  input: UpdateExpenseInput
) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    throw new ExpenseServiceError(404, `Expense not found: ${id}.`);
  }

  if (input.businessDay !== undefined && !isValidDateString(input.businessDay)) {
    throw new ExpenseServiceError(400, "Invalid businessDay format. Must be YYYY-MM-DD.");
  }

  if (input.amountCents !== undefined && (!Number.isInteger(input.amountCents) || input.amountCents < 0)) {
    throw new ExpenseServiceError(400, "Expense amountCents must be an integer >= 0.");
  }

  if (input.category !== undefined && !Object.values(ExpenseCategory).includes(input.category)) {
    throw new ExpenseServiceError(400, `Invalid expense category: ${input.category}.`);
  }

  return prisma.expense.update({
    where: { id },
    data: {
      businessDay: input.businessDay,
      category: input.category,
      amountCents: input.amountCents,
      note: input.note,
    },
  });
}

export async function deleteExpense(id: string) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) {
    throw new ExpenseServiceError(404, `Expense not found: ${id}.`);
  }
  return prisma.expense.delete({ where: { id } });
}

export async function listExpenses(startDate?: string, endDate?: string) {
  return prisma.expense.findMany({
    where: {
      businessDay: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: [{ businessDay: "desc" }, { createdAt: "desc" }],
  });
}
