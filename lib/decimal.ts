// Boundary helper for Decimal numbers.
//
// Values cross between Prisma's bundled decimal.js and the app's decimal.js
// ONLY as strings. Never use `instanceof` or `Decimal.isDecimal`.

import { Decimal } from "decimal.js";
import { Prisma } from "@prisma/client";

/**
 * Convert any string, number, or object with toString() to an app Decimal instance.
 */
export function toDec(v: string | number | { toString(): string } | null | undefined): Decimal {
  if (v === null || v === undefined) {
    return new Decimal(0);
  }
  return new Decimal(String(v));
}

/**
 * Convert an app Decimal (or string/number) to Prisma.Decimal.
 */
export function toPrismaDec(d: Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(d.toString());
}

/**
 * Round a value to integer centavos using ROUND_HALF_UP.
 */
export function roundToCentavos(val: Decimal | number | string): number {
  const d = toDec(val);
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
