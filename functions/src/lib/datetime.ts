/**
 * JST (UTC+9) date/time helpers.
 *
 * Cloud Functions run with TZ=UTC, so every user-facing date must be derived
 * explicitly rather than through the host locale. All helpers here are pure and
 * operate on "YYYY-MM-DD" strings interpreted as JST calendar days.
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** Returns the JST calendar day (YYYY-MM-DD) for an epoch timestamp. */
export function toJstDateString(epochMs: number = Date.now()): string {
  const shifted = new Date(epochMs + JST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's JST calendar day (YYYY-MM-DD). */
export function todayJST(now: number = Date.now()): string {
  return toJstDateString(now);
}

/** Hour of day (0-23) in JST for an epoch timestamp. */
export function jstHour(epochMs: number = Date.now()): number {
  return new Date(epochMs + JST_OFFSET_MS).getUTCHours();
}

/** Epoch seconds for 00:00 JST of the given calendar day. */
export function jstMidnightUnix(date: string): number {
  const [year, month, day] = date.split("-").map((s) => parseInt(s, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 1000) - 9 * 60 * 60;
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map((s) => parseInt(s, 10));
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map((s) => parseInt(s, 10));
  const [ty, tm, td] = to.split("-").map((s) => parseInt(s, 10));
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS
  );
}

/** Japanese weekday character ("日".."土") for a calendar day. */
export function weekdayJa(date: string): string {
  const [year, month, day] = date.split("-").map((s) => parseInt(s, 10));
  return WEEKDAYS_JA[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** "8/23(日)" */
export function formatShortJa(date: string): string {
  const [, month, day] = date.split("-").map((s) => parseInt(s, 10));
  return `${month}/${day}(${weekdayJa(date)})`;
}

/** "2026年8月23日(日)" */
export function formatLongJa(date: string): string {
  const [year, month, day] = date.split("-").map((s) => parseInt(s, 10));
  return `${year}年${month}月${day}日(${weekdayJa(date)})`;
}

/** "8/23 18:30" in JST, for timestamps in milliseconds. */
export function formatTimestampJST(epochMs: number): string {
  const shifted = new Date(epochMs + JST_OFFSET_MS);
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/** "12:00" in JST, for timestamps in seconds (as embedded in the page HTML). */
export function formatSlotTime(epochSec: number): string {
  const shifted = new Date(epochSec * 1000 + JST_OFFSET_MS);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Resolves a bare "M/D" calendar header into a full date, choosing the year
 * that puts it closest to `reference`. Handles the December/January wrap.
 */
export function resolveYearForMonthDay(
  month: number,
  day: number,
  reference: string
): string {
  const [refYear, refMonth] = reference.split("-").map((s) => parseInt(s, 10));
  let year = refYear;
  if (refMonth >= 11 && month <= 2) {
    year = refYear + 1;
  } else if (refMonth <= 2 && month >= 11) {
    year = refYear - 1;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
