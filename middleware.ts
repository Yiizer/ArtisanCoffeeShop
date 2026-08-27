import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "./lib/auth";

// Paths that are accessible without authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip internal nextjs paths, static files, and icons
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Read and verify session token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const user = token ? await verifyAuthToken(token) : null;

  // 3. Handle unauthenticated requests
  if (!user) {
    // If the request is for a public path, allow it through
    if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.next();
    }

    // For API routes, return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required. Please log in." },
        { status: 401 }
      );
    }

    // For page routes, redirect to /login
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Handle authenticated users visiting /login or root /
  if (pathname === "/login" || pathname === "/") {
    return NextResponse.redirect(new URL("/order", request.url));
  }

  // 5. Role-based Authorization: Admin only routes
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/order", request.url));
    }
  }

  if (pathname.startsWith("/api/admin/")) {
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden. Administrator privileges required." },
        { status: 403 }
      );
    }
  }

  // 6. Restrict Menu modifications (POST, PATCH, DELETE) to ADMIN role only
  if (pathname.startsWith("/api/menu")) {
    const method = request.method.toUpperCase();
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      if (user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Forbidden. Only administrators can modify the menu." },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

