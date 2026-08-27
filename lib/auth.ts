// Authentication utilities: PBKDF2 password hashing & HMAC-SHA256 session tokens.
// Uses native Web Crypto API (crypto.subtle) - zero external dependencies,
// 100% compatible with Node.js, Vercel, and Next.js Edge / Middleware runtimes.

export type UserRole = "STAFF" | "ADMIN";

export type AuthPayload = {
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  exp: number; // Unix timestamp in seconds
};

export const AUTH_COOKIE_NAME = "artisan_auth_token";

const DEFAULT_SECRET = "artisan-coffee-secret-key-production-change-me-2026";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret(): string {
  return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

// ── Base64URL Helpers ───────────────────────────────────────────────────────

function arrayBufferToBase64Url(buffer: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint8ArrayToString(arr: Uint8Array): string {
  return new TextDecoder().decode(arr);
}

function bufferToHex(buffer: ArrayBuffer | ArrayBufferLike): string {
  return Array.from(new Uint8Array(buffer as ArrayBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUint8Array(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
}

// ── Password Hashing (PBKDF2 with SHA-256) ──────────────────────────────────

/**
 * Hash a password using PBKDF2 with a cryptographically secure random salt.
 * Returns format: "saltHex:hashHex"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bufferToHex(salt.buffer);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    stringToUint8Array(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashHex = bufferToHex(derivedKey);
  return `${saltHex}:${hashHex}`;
}

/**
 * Verify a plain password against a stored "saltHex:hashHex" hash.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [saltHex, expectedHashHex] = storedHash.split(":");
  if (!saltHex || !expectedHashHex) return false;

  const salt = hexToUint8Array(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    stringToUint8Array(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const computedHashHex = bufferToHex(derivedKey);
  return computedHashHex === expectedHashHex;
}

// ── Session Token Generation & Verification (HMAC-SHA256) ───────────────────

async function getHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    stringToUint8Array(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Create a signed stateless session token.
 */
export async function createAuthToken(
  user: Omit<AuthPayload, "exp">,
  ttlSeconds: number = TOKEN_TTL_SECONDS
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: AuthPayload = { ...user, exp };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = arrayBufferToBase64Url(stringToUint8Array(payloadJson).buffer);

  const key = await getHmacKey();
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    stringToUint8Array(payloadB64)
  );
  const signatureB64 = arrayBufferToBase64Url(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify a stateless session token. Returns null if invalid or expired.
 */
export async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  try {
    const key = await getHmacKey();
    const signatureBuffer = base64UrlToArrayBuffer(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      stringToUint8Array(payloadB64)
    );

    if (!isValid) return null;

    const payloadJson = uint8ArrayToString(
      new Uint8Array(base64UrlToArrayBuffer(payloadB64))
    );
    const payload = JSON.parse(payloadJson) as AuthPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
