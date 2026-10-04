// Shared helper to translate service/auth errors into JSON HTTP responses for route handlers.

import { NextResponse } from "next/server";

export function toErrorResponse(err: unknown): NextResponse {
  if (err && typeof err === "object" && "statusCode" in err && typeof (err as any).statusCode === "number") {
    const errorObj = err as { statusCode: number; message: string; detail?: unknown };
    return NextResponse.json(
      { error: errorObj.message, detail: errorObj.detail ?? null },
      { status: errorObj.statusCode }
    );
  }

  if (err instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error." },
    { status: 500 }
  );
}
