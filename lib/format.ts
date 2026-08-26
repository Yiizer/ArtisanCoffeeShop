// Shared money formatting helper. All monetary values are stored as integer
// centavos and formatted to pesos only at display time (Requirement 11.2).

/** Format an integer centavos amount as a peso string, e.g. 12050 -> "₱120.50". */
export function formatPesos(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}
