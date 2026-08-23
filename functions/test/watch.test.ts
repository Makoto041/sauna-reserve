import { describe, it, expect } from "vitest";
import { datesToRemember } from "../src/lib/watch.js";

describe("datesToRemember", () => {
  it("records everything once the notification went out", () => {
    expect(
      datesToRemember(["2026-08-23", "2026-08-24"], ["2026-08-24"], true)
    ).toEqual(["2026-08-23", "2026-08-24"]);
  });

  it("keeps already-known dates when there is nothing to announce", () => {
    expect(datesToRemember(["2026-08-23"], [], false)).toEqual(["2026-08-23"]);
  });

  it("leaves out dates whose push failed, so the next tick retries", () => {
    // Without this the date would count as old news forever and the opening
    // would never be announced.
    expect(
      datesToRemember(["2026-08-23", "2026-08-24"], ["2026-08-24"], false)
    ).toEqual(["2026-08-23"]);
  });

  it("records nothing new when every announcement failed", () => {
    expect(
      datesToRemember(["2026-08-24"], ["2026-08-24"], false)
    ).toEqual([]);
  });
});
