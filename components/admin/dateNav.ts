// Small, deterministic Business_Day date helpers for the Order History
// navigation controls. anchorDate values are YYYY-MM-DD Business_Day strings
// (2 AM Asia/Manila boundary is already applied by lib/businessDay.ts). These
// helpers only shift/format date strings — they never touch the database.

import { getBusinessDay } from "@/lib/businessDay";
import { snapWeekRange } from "@/lib/summaryLogic";

/** Current Business_Day as a YYYY-MM-DD string (2 AM Asia/Manila boundary). */
export function todayBusinessDay(): string {
  return getBusinessDay(new Date());
}

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shift a date string by whole days (may be negative). */
export function shiftDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** Shift a date string by whole calendar months, anchored to day 1. */
export function shiftMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  return fmt(new Date(Date.UTC(y, m - 1 + months, 1)));
}

/** Snap a date string to the Monday of its enclosing Mon–Sun week. */
export function snapToMonday(date: string): string {
  return snapWeekRange(date).startDate;
}

/** Human-friendly month + year label, e.g. "March 2025", from a YYYY-MM-DD. */
export function monthLabel(date: string): string {
  const d = parse(date);
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Short weekday + date label, e.g. "Mon, Mar 3", from a YYYY-MM-DD. */
export function dayLabel(date: string): string {
  const d = parse(date);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
