// GET /api/admin/summary — server-computed day/week/month history aggregates with full profit metrics.

import { NextResponse } from "next/server";
import {
  getSummary,
  isValidView,
  isValidDateString,
} from "@/lib/summary";
import { requireAdmin } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

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
  } catch (err) {
    return toErrorResponse(err);
  }
}
