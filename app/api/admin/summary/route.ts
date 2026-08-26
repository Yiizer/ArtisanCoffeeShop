// GET /api/admin/summary — server-computed day/week/month history aggregates.
//
// This is a no-auth v1 prototype: the route is intentionally not behind any
// authentication. Query params:
//   - view:       "day" | "week" | "month"  (required, validated)
//   - anchorDate: YYYY-MM-DD Business_Day    (required, validated)
// Returns 400 on a missing/invalid view or anchorDate.

import { NextResponse } from "next/server";
import {
  getSummary,
  isValidView,
  isValidDateString,
} from "@/lib/summary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const anchorDate = searchParams.get("anchorDate");

  if (!view || !isValidView(view)) {
    return NextResponse.json(
      { error: "Invalid or missing 'view'; expected 'day', 'week', or 'month'." },
      { status: 400 }
    );
  }

  if (!anchorDate || !isValidDateString(anchorDate)) {
    return NextResponse.json(
      { error: "Invalid or missing 'anchorDate'; expected a YYYY-MM-DD date." },
      { status: 400 }
    );
  }

  const summary = await getSummary(view, anchorDate);
  return NextResponse.json(summary);
}
