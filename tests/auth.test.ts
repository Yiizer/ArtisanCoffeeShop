import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createAuthToken,
  verifyAuthToken,
  type AuthPayload,
} from "../lib/auth";

describe("Authentication Utilities (lib/auth.ts)", () => {
  it("hashes and verifies passwords correctly", async () => {
    const password = "mySecretPassword123!";
    const hash = await hashPassword(password);

    expect(hash).toContain(":");
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrongPassword", hash)).toBe(false);
  });

  it("creates and verifies valid session tokens", async () => {
    const user: Omit<AuthPayload, "exp"> = {
      userId: "usr_123",
      username: "admin",
      name: "Admin Manager",
      role: "ADMIN",
    };

    const token = await createAuthToken(user, 3600);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const verified = await verifyAuthToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("usr_123");
    expect(verified?.username).toBe("admin");
    expect(verified?.role).toBe("ADMIN");
  });

  it("rejects expired or tampered tokens", async () => {
    const user: Omit<AuthPayload, "exp"> = {
      userId: "usr_456",
      username: "cashier",
      name: "Cashier Staff",
      role: "STAFF",
    };

    // Expired token (-10 seconds TTL)
    const expiredToken = await createAuthToken(user, -10);
    const resultExpired = await verifyAuthToken(expiredToken);
    expect(resultExpired).toBeNull();

    // Tampered token
    const validToken = await createAuthToken(user, 3600);
    const tamperedToken = validToken.substring(0, validToken.length - 5) + "abcde";
    const resultTampered = await verifyAuthToken(tamperedToken);
    expect(resultTampered).toBeNull();
  });
});

