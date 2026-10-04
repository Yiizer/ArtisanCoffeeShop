// Server-side authentication helpers for Next.js App Router (Server Components & Route Handlers).

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken, type AuthPayload } from "./auth";

/**
 * Read and verify the current session payload from cookies or request.
 * Returns null if not authenticated or token is invalid/expired.
 */
export async function getCurrentUser(request?: NextRequest | Request): Promise<AuthPayload | null> {
  let token: string | undefined;
  if (request && "cookies" in request && typeof (request as any).cookies?.get === "function") {
    token = (request as NextRequest).cookies.get(AUTH_COOKIE_NAME)?.value;
  }
  if (!token && request && typeof request.headers?.get === "function") {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
    }
  }
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    } catch {
      // Outside of Next.js server context (e.g. testing)
    }
  }
  if (!token) return null;
  return verifyAuthToken(token);
}

/**
 * Enforce that the request has a valid session.
 * Throws an Error with 401 status if not authenticated.
 */
export async function requireAuth(request?: NextRequest | Request): Promise<AuthPayload> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new AuthError(401, "Authentication required. Please log in.");
  }
  return user;
}

/**
 * Enforce that the request has an ADMIN role.
 * Throws an Error with 403 status if role is not ADMIN.
 */
export async function requireAdmin(request?: NextRequest | Request): Promise<AuthPayload> {
  const user = await requireAuth(request);
  if (user.role !== "ADMIN") {
    throw new AuthError(403, "Access forbidden. Administrator privileges required.");
  }
  return user;
}

export class AuthError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}
