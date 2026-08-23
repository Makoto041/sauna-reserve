import { describe, it, expect } from "vitest";
import {
  addDays,
  diffDays,
  formatLongJa,
  formatShortJa,
  formatSlotTime,
  formatTimestampJST,
  jstHour,
  jstMidnightUnix,
  resolveYearForMonthDay,
  toJstDateString,
  weekdayJa,
} from "../src/lib/datetime.js";

/** 2026-08-22 15:30 UTC = 2026-08-23 00:30 JST */
const LATE_NIGHT_UTC = Date.UTC(2026, 7, 22, 15, 30);

describe("toJstDateString", () => {
  it("rolls to the next JST day after 15:00 UTC", () => {
    expect(toJstDateString(LATE_NIGHT_UTC)).toBe("2026-08-23");
  });

  it("stays on the previous JST day just before the boundary", () => {
    expect(toJstDateString(Date.UTC(2026, 7, 22, 14, 59))).toBe("2026-08-22");
  });

  it("handles the new year boundary", () => {
    expect(toJstDateString(Date.UTC(2026, 11, 31, 15, 0))).toBe("2027-01-01");
  });
});

describe("jstHour", () => {
  it("returns the JST hour, not the host hour", () => {
    expect(jstHour(LATE_NIGHT_UTC)).toBe(0);
    expect(jstHour(Date.UTC(2026, 7, 22, 21, 0))).toBe(6);
  });
});

describe("jstMidnightUnix", () => {
  it("returns 00:00 JST as epoch seconds", () => {
    // 2026-08-23 00:00 JST = 2026-08-22 15:00 UTC
    expect(jstMidnightUnix("2026-08-23")).toBe(Date.UTC(2026, 7, 22, 15) / 1000);
  });
});

describe("addDays / diffDays", () => {
  it("adds across a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("subtracts across a year boundary", () => {
    expect(addDays("2027-01-02", -3)).toBe("2026-12-30");
  });

  it("measures whole days between dates", () => {
    expect(diffDays("2026-08-23", "2026-08-29")).toBe(6);
    expect(diffDays("2026-08-23", "2026-08-30")).toBe(7);
    expect(diffDays("2026-08-30", "2026-08-23")).toBe(-7);
  });
});

describe("formatting", () => {
  it("names the weekday in Japanese", () => {
    expect(weekdayJa("2026-08-23")).toBe("日");
    expect(weekdayJa("2026-08-24")).toBe("月");
  });

  it("formats short and long Japanese dates", () => {
    expect(formatShortJa("2026-08-23")).toBe("8/23(日)");
    expect(formatLongJa("2026-08-23")).toBe("2026年8月23日(日)");
  });

  it("formats timestamps in JST", () => {
    expect(formatTimestampJST(LATE_NIGHT_UTC)).toBe("8/23 00:30");
  });

  it("formats slot start times from epoch seconds", () => {
    expect(formatSlotTime(1787540400)).toBe("12:00");
  });
});

describe("resolveYearForMonthDay", () => {
  it("keeps the reference year in the common case", () => {
    expect(resolveYearForMonthDay(8, 23, "2026-08-25")).toBe("2026-08-23");
  });

  it("rolls forward when December looks at January", () => {
    expect(resolveYearForMonthDay(1, 2, "2026-12-30")).toBe("2027-01-02");
  });

  it("rolls back when January looks at December", () => {
    expect(resolveYearForMonthDay(12, 30, "2027-01-02")).toBe("2026-12-30");
  });
});
