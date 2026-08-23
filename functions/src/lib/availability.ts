/**
 * Availability detection for SelectType reservation pages.
 *
 * Page structure (verified against the live page):
 * - The calendar always renders a 7-day window. `?id=<formId>&date=YYYYMMDD`
 *   jumps the window so that YYYYMMDD is the first column, which is how we
 *   reach dates outside the current week.
 * - Header table (`cl-header`):
 *     <th class="cl-day ..."><span ...>8/23<span class="sm-block">(日)</span></span></th>
 * - Data table (`cl-container`), one row per time slot:
 *     <td class="cl-day ..."><div class="cl-half-time"><div class="cl-day-content">
 *       <a onclick="...loadRsvTimeModal(1787540400,...)" class="slot_cls_c178267 tm_178267_1787540400">
 *         <span class="symbol-blue">●</span><span class="num-seat">5人</span>
 *       </a>
 *     </div></div></td>
 * - Markers: ● 受付中 / ▲ 残りわずか / × 締め切り. Cells for days that are not
 *   open for reservation yet carry `cl-notday` and are empty.
 * - The legend at the top of the page also contains ●▲×, so detection is always
 *   scoped to the `cl-container` table.
 */

import {
  formatSlotTime,
  addDays,
  diffDays,
  resolveYearForMonthDay,
  todayJST,
} from "./datetime.js";

const BASE_URL = "https://select-type.com/rsv/?id=0AEeQuFE0HM";

/** Days rendered in a single calendar page. */
export const WINDOW_DAYS = 7;

/** How long to wait for the reservation page before giving up. */
const FETCH_TIMEOUT_MS = 15_000;

/** A bookable time slot on a given day. */
export interface Slot {
  /** Slot start time as epoch seconds, taken from the page itself. */
  startAt?: number;
  /** Display time, e.g. "12:00". */
  time: string;
  /** "●" = 受付中, "▲" = 残りわずか. */
  marker: "●" | "▲";
  /** Remaining seats as displayed by the page, e.g. "5人". */
  seats?: string;
}

/** Availability for one calendar day. */
export interface DayAvailability {
  /** YYYY-MM-DD */
  date: string;
  /** Only slots marked ● or ▲, in page order. Empty means "no availability". */
  slots: Slot[];
}

const CONTAINER_RE =
  /<table[^>]*class="[^"]*cl-container[^"]*"[^>]*>[\s\S]*?<\/table>/i;
const HEADER_CELL_RE =
  /<th[^>]*class="[^"]*cl-day[^"]*"[^>]*>[\s\S]*?<\/th>/gi;
const ROW_RE = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
const DAY_CELL_RE = /<td[^>]*class="[^"]*cl-day[^"]*"[^>]*>[\s\S]*?<\/td>/gi;
const TIME_CELL_RE = /<td[^>]*class="[^"]*cl-time[^"]*"[^>]*>([\s\S]*?)<\/td>/i;

/**
 * Reads the "M/D" labels out of the calendar header and resolves them to full
 * dates relative to `reference` (needed because the page omits the year).
 */
function parseHeaderDates(html: string, reference: string): string[] {
  const headers = html.match(HEADER_CELL_RE) ?? [];
  const dates: string[] = [];

  for (const header of headers) {
    const match = header.match(/>(\d{1,2})\/(\d{1,2})[<(]/);
    if (!match) {
      // Keep the column slot so cell indexes stay aligned with the header row.
      dates.push("");
      continue;
    }
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    dates.push(resolveYearForMonthDay(month, day, reference));
  }

  return dates;
}

/** Builds a Slot from one `<td class="cl-day">` cell, or null if it is not open. */
function parseCell(cell: string, fallbackTime: string): Slot | null {
  const markerMatch = cell.match(/[●▲]/);
  if (!markerMatch) {
    return null;
  }

  const startMatch =
    cell.match(/loadRsvTimeModal\((\d+)/) ?? cell.match(/tm_\d+_(\d+)/);
  const startAt = startMatch ? parseInt(startMatch[1], 10) : undefined;
  const seatsMatch = cell.match(/class="num-seat"[^>]*>([^<]+)</);

  return {
    ...(startAt !== undefined ? { startAt } : {}),
    time: startAt !== undefined ? formatSlotTime(startAt) : fallbackTime,
    marker: markerMatch[0] as "●" | "▲",
    ...(seatsMatch ? { seats: seatsMatch[1].trim() } : {}),
  };
}

/**
 * Parses a calendar page into per-day availability.
 *
 * @param html - Full page HTML
 * @param reference - A date inside the rendered window (used to resolve the
 *   year for the header's "M/D" labels). Defaults to today in JST.
 * @returns One entry per rendered column, in page order. An empty array means
 *   the calendar could not be found.
 */
export function parseCalendar(
  html: string,
  reference: string = todayJST()
): DayAvailability[] {
  const containerMatch = html.match(CONTAINER_RE);
  if (!containerMatch) {
    return [];
  }

  const dates = parseHeaderDates(html, reference);
  const days: DayAvailability[] = dates.map((date) => ({ date, slots: [] }));
  const rows = containerMatch[0].match(ROW_RE) ?? [];

  for (const row of rows) {
    const timeMatch = row.match(TIME_CELL_RE);
    const fallbackTime = timeMatch
      ? timeMatch[1].replace(/<[^>]*>/g, "").trim()
      : "";
    const cells = row.match(DAY_CELL_RE) ?? [];

    for (let column = 0; column < cells.length && column < days.length; column++) {
      const slot = parseCell(cells[column], fallbackTime);
      if (slot) {
        days[column].slots.push(slot);
      }
    }
  }

  return days.filter((day) => day.date !== "");
}

/**
 * Detects whether the page shows any availability.
 *
 * @param html - The HTML content to check
 * @param targetDate - Optional day to restrict the check to (YYYY-MM-DD)
 * @returns true if ● or ▲ is present (for `targetDate` when given)
 */
export function detectAvailability(html: string, targetDate?: string): boolean {
  const days = parseCalendar(html, targetDate ?? todayJST());

  if (days.length === 0) {
    // Not a SelectType calendar page: fall back to bare markers in content
    // position, which still excludes most legend/aria text.
    return !targetDate && (html.includes(">●<") || html.includes(">▲<"));
  }

  if (!targetDate) {
    return days.some((day) => day.slots.length > 0);
  }

  const day = days.find((entry) => entry.date === targetDate);
  return day !== undefined && day.slots.length > 0;
}

/**
 * Returns the reservation page URL, optionally scrolled to a given week.
 *
 * @param date - Optional YYYY-MM-DD to show as the first calendar column
 */
export function getTargetUrl(date?: string): string {
  return date ? `${BASE_URL}&date=${date.replace(/-/g, "")}` : BASE_URL;
}

/**
 * Groups dates into the fewest 7-day windows that cover them all, so a single
 * page fetch can answer for up to a week's worth of target dates.
 *
 * @param dates - YYYY-MM-DD dates (any order, duplicates tolerated)
 * @returns Window start dates, ascending
 */
export function groupIntoWindows(dates: string[]): string[] {
  const sorted = [...new Set(dates)].sort();
  const windows: string[] = [];

  for (const date of sorted) {
    const current = windows[windows.length - 1];
    if (current === undefined || diffDays(current, date) >= WINDOW_DAYS) {
      windows.push(date);
    }
  }

  return windows;
}

/** Fetches one calendar page. */
async function fetchCalendarPage(
  windowStart?: string
): Promise<{ html?: string; error?: string }> {
  try {
    const response = await fetch(getTargetUrl(windowStart), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SaunaReserveBot/1.0; +notification-only)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return { html: await response.text() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Fetch error: ${message}` };
  }
}

/** Result of one monitoring pass. */
export interface AvailabilityReport {
  /** Availability per requested date. Dates the calendar did not render are absent. */
  byDate: Record<string, Slot[]>;
  /** Requested dates the calendar did not render at all. */
  missing: string[];
  /** Fetch/parse failures, one per failed window. */
  errors: string[];
  /** Number of HTTP requests made. */
  fetches: number;
}

/**
 * Checks the given target dates, fetching one page per 7-day window.
 *
 * @param dates - Target dates in YYYY-MM-DD
 */
export async function checkDates(dates: string[]): Promise<AvailabilityReport> {
  const report: AvailabilityReport = {
    byDate: {},
    missing: [],
    errors: [],
    fetches: 0,
  };
  const wanted = new Set(dates);
  const windows = groupIntoWindows(dates);

  for (const windowStart of windows) {
    const { html, error } = await fetchCalendarPage(windowStart);
    report.fetches++;

    if (error || !html) {
      report.errors.push(`${windowStart}: ${error ?? "empty response"}`);
      continue;
    }

    for (const day of parseCalendar(html, windowStart)) {
      if (wanted.has(day.date)) {
        report.byDate[day.date] = day.slots;
      }
    }
  }

  report.missing = [...wanted].filter(
    (date) => !(date in report.byDate) && !hasFailedWindow(date, report.errors)
  );

  return report;
}

/** True when the window covering `date` failed to load. */
function hasFailedWindow(date: string, errors: string[]): boolean {
  return errors.some((entry) => {
    const start = entry.split(":")[0];
    const offset = diffDays(start, date);
    return offset >= 0 && offset < WINDOW_DAYS;
  });
}

/**
 * Checks the currently displayed week (used when no target dates are set).
 */
export async function checkCurrentWeek(): Promise<AvailabilityReport> {
  const { html, error } = await fetchCalendarPage();
  const report: AvailabilityReport = {
    byDate: {},
    missing: [],
    errors: [],
    fetches: 1,
  };

  if (error || !html) {
    report.errors.push(error ?? "empty response");
    return report;
  }

  for (const day of parseCalendar(html, todayJST())) {
    report.byDate[day.date] = day.slots;
  }

  return report;
}

/** Convenience: the last day covered by a window starting at `date`. */
export function windowEnd(date: string): string {
  return addDays(date, WINDOW_DAYS - 1);
}
