/**
 * Command parsing for the LINE bot.
 *
 * Kept separate from the webhook handler so the whole command surface can be
 * unit-tested without constructing Cloud Functions handlers.
 */

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 60;

/* ------------------------------------------------------------------ *
 * Date parsing
 * ------------------------------------------------------------------ */

/** Formats y/m/d as YYYY-MM-DD, or null when the calendar date does not exist. */
function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null; // e.g. 2/30
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a date the user typed and returns YYYY-MM-DD.
 *
 * Accepts "1/15", "01-15", "1月15日", "2027/1/15", "2027-01-15". When the year
 * is omitted it resolves to the next occurrence, so "1/15" sent in August means
 * next January rather than a date eight months in the past.
 *
 * @param input - Raw token
 * @param today - Today's date in JST (YYYY-MM-DD)
 */
export function parseDate(input: string, today: string): string | null {
  const trimmed = input.trim();

  const withYear = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (withYear) {
    return toIsoDate(+withYear[1], +withYear[2], +withYear[3]);
  }

  const monthDay =
    trimmed.match(/^(\d{1,2})[/-](\d{1,2})$/) ??
    trimmed.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (!monthDay) {
    return null;
  }

  const month = +monthDay[1];
  const day = +monthDay[2];
  const currentYear = parseInt(today.slice(0, 4), 10);
  const thisYear = toIsoDate(currentYear, month, day);
  if (thisYear && thisYear >= today) {
    return thisYear;
  }
  return toIsoDate(currentYear + 1, month, day);
}

/**
 * Parses a whole message as a list of dates.
 *
 * Every token must be a date; otherwise the message is not a date command at
 * all (so "8/23は空いてますか?" is not silently treated as an add).
 *
 * @returns Sorted unique dates, or an empty array when the text is not a date list
 */
export function parseMultipleDates(input: string, today: string): string[] {
  const parts = input.split(/[\s,、　]+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return [];
  }

  const dates = new Set<string>();
  for (const part of parts) {
    const parsed = parseDate(part, today);
    if (!parsed) {
      return [];
    }
    dates.add(parsed);
  }

  return [...dates].sort();
}

/**
 * Commands that change the shared watch configuration.
 *
 * The rich menu is the default for every user of the channel, so these are now
 * one tap away for anyone who adds the bot — while line/target holds a single
 * recipient. The webhook refuses them when someone else is registered.
 */
export const MUTATING_COMMANDS: ReadonlySet<Command["kind"]> = new Set([
  "start",
  "stop",
  "add",
  "del",
  "clear",
  "interval",
  "night",
]);

/**
 * Splits requested dates into ones still worth monitoring and ones already
 * gone. An explicit year ("2020/1/1") or a date picker built on an earlier day
 * can both hand us a past date, which the scheduler would only prune later.
 *
 * @param dates - YYYY-MM-DD dates
 * @param today - Today's date in JST
 */
export function splitPastDates(
  dates: string[],
  today: string
): { future: string[]; past: string[] } {
  return {
    future: dates.filter((date) => date >= today),
    past: dates.filter((date) => date < today),
  };
}

/* ------------------------------------------------------------------ *
 * Command resolution
 * ------------------------------------------------------------------ */

export type Command =
  | { kind: "register" }
  /** Produced by the follow event, never by resolveCommand. */
  | { kind: "follow" }
  | { kind: "start" }
  | { kind: "stop" }
  | { kind: "status" }
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "delmenu" }
  | { kind: "del"; date: string }
  | { kind: "add"; dates: string[] }
  | { kind: "interval"; minutes: number }
  | { kind: "intervalOutOfRange" }
  | { kind: "night"; on: boolean }
  | { kind: "badDate" }
  | { kind: "unknown" };

const KEYWORDS: Record<string, Command> = {
  start: { kind: "register" },
  登録: { kind: "register" },
  on: { kind: "start" },
  開始: { kind: "start" },
  監視開始: { kind: "start" },
  off: { kind: "stop" },
  停止: { kind: "stop" },
  監視停止: { kind: "stop" },
  status: { kind: "status" },
  状態: { kind: "status" },
  clear: { kind: "clear" },
  全削除: { kind: "clear" },
  削除: { kind: "delmenu" },
  help: { kind: "help" },
  menu: { kind: "help" },
  ヘルプ: { kind: "help" },
  使い方: { kind: "help" },
  メニュー: { kind: "help" },
  // People who are stuck rarely type the exact command name.
  はじめて: { kind: "help" },
  初めて: { kind: "help" },
  わからない: { kind: "help" },
  分からない: { kind: "help" },
  わかりません: { kind: "help" },
  教えて: { kind: "help" },
  "?": { kind: "help" },
  "？": { kind: "help" },
  夜間停止: { kind: "night", on: true },
  "24時間監視": { kind: "night", on: false },
};

/**
 * Maps a typed message to a command.
 *
 * @param rawText - The user's message, already trimmed
 * @param today - Today's date in JST
 */
export function resolveCommand(rawText: string, today: string): Command {
  // hasOwn, not a bare lookup: "constructor" and "__proto__" would otherwise
  // resolve through the prototype chain into a bogus command object.
  const key = rawText.toLowerCase();
  if (Object.hasOwn(KEYWORDS, key)) {
    return KEYWORDS[key];
  }

  const interval = rawText.match(
    /^(?:間隔\s*(\d+)分?|interval\s*(\d+)|(\d+)分)$/i
  );
  if (interval) {
    const minutes = parseInt(interval[1] ?? interval[2] ?? interval[3], 10);
    return minutes >= MIN_INTERVAL_MINUTES && minutes <= MAX_INTERVAL_MINUTES
      ? { kind: "interval", minutes }
      : { kind: "intervalOutOfRange" };
  }

  const remove = rawText.match(/^削除\s*(.+)$/);
  if (remove) {
    const date = parseDate(remove[1], today);
    return date ? { kind: "del", date } : { kind: "badDate" };
  }

  const dates = parseMultipleDates(rawText, today);
  if (dates.length > 0) {
    return { kind: "add", dates };
  }

  return { kind: "unknown" };
}

