import { describe, it, expect } from "vitest";
import {
  parseDate,
  splitPastDates,
  parseMultipleDates,
  resolveCommand,
} from "../src/lib/commands.js";

const TODAY = "2026-08-22";

describe("parseDate", () => {
  it("accepts slash, dash and Japanese forms", () => {
    expect(parseDate("8/23", TODAY)).toBe("2026-08-23");
    expect(parseDate("08-23", TODAY)).toBe("2026-08-23");
    expect(parseDate("8月23日", TODAY)).toBe("2026-08-23");
    expect(parseDate("8月23", TODAY)).toBe("2026-08-23");
  });

  it("accepts an explicit year", () => {
    expect(parseDate("2027/1/15", TODAY)).toBe("2027-01-15");
    expect(parseDate("2027-01-15", TODAY)).toBe("2027-01-15");
  });

  it("resolves a bare month/day to the next occurrence", () => {
    // Typed in August, "1/15" means next January - not eight months ago.
    expect(parseDate("1/15", TODAY)).toBe("2027-01-15");
  });

  it("keeps today itself in the current year", () => {
    expect(parseDate("8/22", TODAY)).toBe("2026-08-22");
  });

  it("rejects dates that do not exist", () => {
    expect(parseDate("2/30", TODAY)).toBeNull();
    expect(parseDate("13/1", TODAY)).toBeNull();
    expect(parseDate("2027-02-29", TODAY)).toBeNull();
  });

  it("rejects non-dates", () => {
    expect(parseDate("開始", TODAY)).toBeNull();
    expect(parseDate("", TODAY)).toBeNull();
    expect(parseDate("5分", TODAY)).toBeNull();
  });
});

describe("parseMultipleDates", () => {
  it("splits on spaces, commas and full-width separators", () => {
    expect(parseMultipleDates("9/1 9/2, 9/3、9/4", TODAY)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("de-duplicates and sorts", () => {
    expect(parseMultipleDates("9/3 9/1 9/3", TODAY)).toEqual([
      "2026-09-01",
      "2026-09-03",
    ]);
  });

  it("refuses a message that is not purely dates", () => {
    expect(parseMultipleDates("8/23は空いてますか?", TODAY)).toEqual([]);
    expect(parseMultipleDates("9/1 とりあえず", TODAY)).toEqual([]);
  });
});

describe("resolveCommand", () => {
  it("maps Japanese and English keywords", () => {
    expect(resolveCommand("登録", TODAY)).toEqual({ kind: "register" });
    expect(resolveCommand("start", TODAY)).toEqual({ kind: "register" });
    expect(resolveCommand("開始", TODAY)).toEqual({ kind: "start" });
    expect(resolveCommand("ON", TODAY)).toEqual({ kind: "start" });
    expect(resolveCommand("停止", TODAY)).toEqual({ kind: "stop" });
    expect(resolveCommand("状態", TODAY)).toEqual({ kind: "status" });
    expect(resolveCommand("使い方", TODAY)).toEqual({ kind: "help" });
    expect(resolveCommand("全削除", TODAY)).toEqual({ kind: "clear" });
  });

  it("toggles the night pause", () => {
    expect(resolveCommand("夜間停止", TODAY)).toEqual({
      kind: "night",
      on: true,
    });
    expect(resolveCommand("24時間監視", TODAY)).toEqual({
      kind: "night",
      on: false,
    });
  });

  it("parses interval commands", () => {
    expect(resolveCommand("5分", TODAY)).toEqual({
      kind: "interval",
      minutes: 5,
    });
    expect(resolveCommand("間隔 10", TODAY)).toEqual({
      kind: "interval",
      minutes: 10,
    });
    expect(resolveCommand("interval 30", TODAY)).toEqual({
      kind: "interval",
      minutes: 30,
    });
  });

  it("rejects out-of-range intervals instead of storing them", () => {
    expect(resolveCommand("0分", TODAY)).toEqual({ kind: "intervalOutOfRange" });
    expect(resolveCommand("90分", TODAY)).toEqual({
      kind: "intervalOutOfRange",
    });
  });

  it("opens the delete picker for a bare 削除", () => {
    expect(resolveCommand("削除", TODAY)).toEqual({ kind: "delmenu" });
  });

  it("deletes a specific date", () => {
    expect(resolveCommand("削除 9/1", TODAY)).toEqual({
      kind: "del",
      date: "2026-09-01",
    });
    expect(resolveCommand("削除9/1", TODAY)).toEqual({
      kind: "del",
      date: "2026-09-01",
    });
  });

  it("reports an unreadable delete target", () => {
    expect(resolveCommand("削除 らいしゅう", TODAY)).toEqual({
      kind: "badDate",
    });
  });

  it("adds dates", () => {
    expect(resolveCommand("9/1 9/2", TODAY)).toEqual({
      kind: "add",
      dates: ["2026-09-01", "2026-09-02"],
    });
  });

  it("falls through to unknown for free text", () => {
    expect(resolveCommand("こんにちは", TODAY)).toEqual({ kind: "unknown" });
  });
});

describe("splitPastDates", () => {
  it("keeps today and future dates", () => {
    expect(
      splitPastDates(["2026-08-22", "2026-09-01"], TODAY)
    ).toEqual({ future: ["2026-08-22", "2026-09-01"], past: [] });
  });

  it("separates out dates that have already passed", () => {
    // An explicit year bypasses the "next occurrence" rule, and a date picker
    // built on an earlier day can still be tapped today.
    expect(splitPastDates(["2020-01-01", "2026-09-01"], TODAY)).toEqual({
      future: ["2026-09-01"],
      past: ["2020-01-01"],
    });
  });

  it("reports everything as past when nothing is usable", () => {
    expect(splitPastDates(["2026-08-21"], TODAY)).toEqual({
      future: [],
      past: ["2026-08-21"],
    });
  });
});
