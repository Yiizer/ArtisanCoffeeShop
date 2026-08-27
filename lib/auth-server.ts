// Server-side authentication helpers for Next.js App Router (Server Components & Route Handlers).

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifyAuthToken, type AuthPayload, type UserRole } from "./auth";

/**
 * Read and verify the current session payload from cookies.
 * Returns null if not authenticated or token is invalid/expired.
 */
export async function getCurrentUser(): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

/**
 * Enforce that the request has a valid session.
 * Throws an Error with 401 status if not authenticated.
 */
export async function requireAuth(): Promise<AuthPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError(401, "Authentication required. Please log in.");
  }
  return user;
}

/**
 * Enforce that the request has an ADMIN role.
 * Throws an Error with 403 status if role is not ADMIN.
 */
export async function requireAdmin(): Promise<AuthPayload> {
  const user = await requireAuth();
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

