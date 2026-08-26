// Pure Business_Day + daily-number logic.
//
// The business day is anchored at 2 AM Asia/Manila. Asia/Manila is a fixed
// UTC+08:00 offset with no daylight saving time, so we implement the boundary
// with deterministic offset math (no Intl/timezone database dependency). This
// keeps the logic pure and the tests stable.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+08:00, no DST
const BOUNDARY_HOUR = 2; // business day starts at 02:00 Manila time
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Map a timestamp to its Business_Day as a `YYYY-MM-DD` string.
 *
 * A moment between 00:00 and 01:59:59.999 Manila time belongs to the *previous*
 * calendar day's business day, because the day boundary is 2 AM.
 */
export function getBusinessDay(timestamp: Date | number): string {
  const t = typeof timestamp === "number" ? timestamp : timestamp.getTime();
  // Shift into Manila local time, then back the boundary so that 2 AM maps to
  // midnight of the shifted clock. The UTC calendar date of the shifted value
  // is the business day.
  const shifted = t + MANILA_OFFSET_MS - BOUNDARY_HOUR * 60 * 60 * 1000;
  const d = new Date(shifted);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
}

/**
 * Epoch-ms of the start of a business day (i.e. 02:00 Manila on that date).
 * Useful for constructing timestamps that fall within a known business day.
 */
export function businessDayStartUtcMs(businessDay: string): number {
  const [year, month, day] = businessDay.split("-").map(Number);
  const midnightUtc = Date.UTC(year, month - 1, day);
  return midnightUtc - MANILA_OFFSET_MS + BOUNDARY_HOUR * 60 * 60 * 1000;
}

/** Exclusive end (epoch-ms) of a business day; equals the next day's start. */
export function businessDayEndUtcMs(businessDay: string): number {
  return businessDayStartUtcMs(businessDay) + DAY_MS;
}

/**
 * Compute the next `dailyNumber` for a new order given how many orders already
 * exist in that business day. Cancelled orders are expected to be included in
 * the count so numbering has no unexplained gaps.
 */
export function computeNextDailyNumber(existingOrdersInDay: number): number {
  return existingOrdersInDay + 1;
}

/**
 * Assign sequential `dailyNumber` values to a chronological list of order
 * creation timestamps. Numbers restart at 1 for the first order of each
 * business day. Every timestamp (including those of orders later cancelled)
 * counts toward the sequence.
 */
export function assignDailyNumbers(timestamps: Array<Date | number>): number[] {
  const counts = new Map<string, number>();
  return timestamps.map((ts) => {
    const day = getBusinessDay(ts);
    const next = (counts.get(day) ?? 0) + 1;
    counts.set(day, next);
    return next;
  });
}
