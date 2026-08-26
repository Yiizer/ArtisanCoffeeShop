// Shared helper to translate an OrderServiceError (or any thrown error) into a
// JSON HTTP response for the route handlers.

import { NextResponse } from "next/server";
import { OrderServiceError } from "./orders";

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof OrderServiceError) {
    return NextResponse.json(
      { error: err.message, detail: err.detail ?? null },
      { status: err.statusCode }
    );
  }

  if (err instanceof SyntaxError) {
    // Thrown by request.json() on a malformed body.
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: "Internal server error." },
    { status: 500 }
  );
}
