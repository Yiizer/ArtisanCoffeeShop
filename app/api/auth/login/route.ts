import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  verifyPassword,
  createAuthToken,
  AUTH_COOKIE_NAME,
  type UserRole,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, pin } = body;

    // 1. PIN Login (Fast POS Access)
    if (pin && typeof pin === "string") {
      const user = await prisma.user.findFirst({
        where: { pin: pin.trim() },
      });

      if (!user) {
        return NextResponse.json(
          { error: "Invalid PIN. Please check and try again." },
          { status: 401 }
        );
      }

      const token = await createAuthToken({
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role as UserRole,
      });

      const response = NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        },
      });

      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return response;
    }

    // 2. Standard Username & Password Login
    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const token = await createAuthToken({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role as UserRole,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}

