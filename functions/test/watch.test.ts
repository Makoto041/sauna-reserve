import { describe, it, expect } from "vitest";
import {
  dateOfSlotKey,
  datesOfSlots,
  slotKey,
  slotsToRemember,
} from "../src/lib/watch.js";

const slot = (time: string) => ({ time, marker: "\u25cf" as const });

describe("slotKey", () => {
  it("identifies a slot by day and time", () => {
    expect(slotKey("2026-08-23", slot("20:00"))).toBe("2026-08-23 20:00");
  });

  it("distinguishes two slots on the same day", () => {
    // The whole point: 8/23 21:00 being open must not mask 8/23 20:00 opening.
    expect(slotKey("2026-08-23", slot("20:00"))).not.toBe(
      slotKey("2026-08-23", slot("21:00"))
    );
  });

  it("round-trips the date", () => {
    expect(dateOfSlotKey(slotKey("2026-08-23", slot("09:30")))).toBe(
      "2026-08-23"
    );
  });
});

describe("datesOfSlots", () => {
  it("collapses slots to the days they fall on", () => {
    expect(
      datesOfSlots([
        "2026-08-24 13:00",
        "2026-08-23 21:00",
        "2026-08-23 20:00",
      ])
    ).toEqual(["2026-08-23", "2026-08-24"]);
  });

  it("returns nothing for no slots", () => {
    expect(datesOfSlots([])).toEqual([]);
  });
});

describe("slotsToRemember", () => {
  it("records everything once the notification went out", () => {
    expect(
      slotsToRemember(
        ["2026-08-23 20:00", "2026-08-23 21:00"],
        ["2026-08-23 20:00"],
        true
      )
    ).toEqual(["2026-08-23 20:00", "2026-08-23 21:00"]);
  });

  it("keeps already-known slots when there is nothing to announce", () => {
    expect(slotsToRemember(["2026-08-23 21:00"], [], false)).toEqual([
      "2026-08-23 21:00",
    ]);
  });

  it("leaves out slots whose push failed, so the next tick retries", () => {
    expect(
      slotsToRemember(
        ["2026-08-23 20:00", "2026-08-23 21:00"],
        ["2026-08-23 20:00"],
        false
      )
    ).toEqual(["2026-08-23 21:00"]);
  });

  it("records nothing new when every announcement failed", () => {
    expect(
      slotsToRemember(["2026-08-23 20:00"], ["2026-08-23 20:00"], false)
    ).toEqual([]);
  });
});

describe("notification decision", () => {
  /** Mirrors the scheduler: anything not already known is announced. */
  const newlyOpen = (known: string[], now: string[]) =>
    now.filter((key) => !new Set(known).has(key));

  it("announces a new time on a day that already had an opening", () => {
    // The reported bug: 8/23 21:00 had been open all day, so when 20:00 freed
    // up the per-date state said "already notified" and nothing was sent.
    expect(
      newlyOpen(
        ["2026-08-23 21:00"],
        ["2026-08-23 20:00", "2026-08-23 21:00"]
      )
    ).toEqual(["2026-08-23 20:00"]);
  });

  it("stays quiet while the same slots remain open", () => {
    expect(
      newlyOpen(["2026-08-23 21:00"], ["2026-08-23 21:00"])
    ).toEqual([]);
  });

  it("announces again after a slot closes and reopens", () => {
    expect(newlyOpen([], ["2026-08-23 20:00"])).toEqual(["2026-08-23 20:00"]);
  });

  it("treats every open slot as new when the state predates slot tracking", () => {
    expect(
      newlyOpen([], ["2026-08-23 20:00", "2026-08-23 21:00"])
    ).toEqual(["2026-08-23 20:00", "2026-08-23 21:00"]);
  });
});
