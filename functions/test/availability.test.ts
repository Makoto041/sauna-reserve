import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addDays } from "../src/lib/datetime.js";
import {
  checkDates,
  detectAvailability,
  parseCalendar,
  groupIntoWindows,
  getTargetUrl,
  windowEnd,
} from "../src/lib/availability.js";

/**
 * Test fixtures based on actual SelectType HTML structure.
 *
 * SelectType calendar structure:
 * - Header table (class="cl-header"): Contains date headers in <th class="cl-day">
 * - Data table (class="cl-container"): Contains availability cells in <td class="cl-day">
 * - Markers: <span class="symbol-black">●</span> = available
 *            <span class="symbol-black">▲</span> = limited
 *            <span class="symbol-gray">×</span> = closed
 */

// Realistic SelectType HTML fixture generator
const createSelectTypeHtml = (
  dates: string[],
  availabilityMatrix: string[][]
) => {
  const headerCells = dates
    .map(
      (date, i) =>
        `<th class="cl-day date${i}_cell_cls"><span class="date${i}_txt_cls">${date}<span class="sm-block">(月)</span></span></th>`
    )
    .join("\n");

  const dataRows = availabilityMatrix
    .map((row, timeIndex) => {
      const time = `${12 + timeIndex}:00`;
      const cells = row
        .map((marker, colIndex) => {
          const markerHtml =
            marker === "●"
              ? '<span class="symbol-black">●</span>'
              : marker === "▲"
                ? '<span class="symbol-black">▲</span>'
                : marker === "×"
                  ? '<span class="symbol-gray">×</span>'
                  : "";
          return `<td class="cl-day cell${colIndex}_col_cls">
          <div class="cl-half-time">
            <div class="cl-day-content">
              ${markerHtml}
            </div>
          </div>
        </td>`;
        })
        .join("\n");

      return `<tr>
        <td class="cl-time time_cell_cls timecell_cls${720 + timeIndex * 60}"><span class="time_cell_txt_cls">${time}</span></td>
        ${cells}
      </tr>`;
    })
    .join("\n");

  return `
<!DOCTYPE html>
<html>
<head><title>SelectType Reservation</title></head>
<body class="selectform calendar">
  <div class="cl-sign chg-text2 avail_area_cls rsvcal_cls">
    <span class="symbol-black">●</span><span class="avail1_label_cls">受付中</span>
    <span class="symbol-black">▲</span><span class="avail2_label_cls">残りわずか</span>
    <span class="symbol-black">×</span><span class="avail3_label_cls">締め切り</span>
  </div>
  <div class="cl-type-week rsvcal_cls">
    <table class="table table-bordered cl-header">
      <thead>
        <tr>
          <th class="cl-time">&nbsp;</th>
          ${headerCells}
          <th class="cl-scroll-width">&nbsp;</th>
        </tr>
      </thead>
    </table>
    <div class="cl-scrollarea">
      <table class="table table-bordered cl-container">
        <tbody>
          ${dataRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
};

describe("detectAvailability", () => {
  describe("without date filter (checks entire page)", () => {
    it("should return true when ● is present in calendar cells", () => {
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "●", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html)).toBe(true);
    });

    it("should return true when ▲ is present in calendar cells", () => {
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "▲", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html)).toBe(true);
    });

    it("should return true when both ● and ▲ are present", () => {
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["●", "▲", "×"],
          ["×", "×", "●"],
        ]
      );
      expect(detectAvailability(html)).toBe(true);
    });

    it("should return false when only × is present in calendar cells", () => {
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "×", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html)).toBe(false);
    });

    it("should return false when no markers are present in cells", () => {
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["", "", ""],
          ["", "", ""],
        ]
      );
      expect(detectAvailability(html)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(detectAvailability("")).toBe(false);
    });

    it("should detect availability with symbol-black class", () => {
      const html = '<span class="symbol-black">●</span>';
      expect(detectAvailability(html)).toBe(true);
    });

    it("should detect availability with simple marker format", () => {
      expect(detectAvailability(">●<")).toBe(true);
      expect(detectAvailability(">▲<")).toBe(true);
    });
  });

  describe("with targetDate filter (real SelectType structure)", () => {
    it("should return true when target date column has ●", () => {
      // 1/3 column (index 1) has ● at 12:00
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "●", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-03")).toBe(true);
    });

    it("should return false when target date column has only ×", () => {
      // 1/3 column (index 1) has only ×, while other columns have ●
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["●", "×", "●"],
          ["▲", "×", "▲"],
        ]
      );
      expect(detectAvailability(html, "2025-01-03")).toBe(false);
    });

    it("should return true when target date column has ▲", () => {
      // 1/3 column (index 1) has ▲
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "▲", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-03")).toBe(true);
    });

    it("should return false when target date is not in calendar view", () => {
      // Calendar shows 1/2-1/4, but we're looking for 1/15
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["●", "●", "●"],
          ["●", "●", "●"],
        ]
      );
      expect(detectAvailability(html, "2025-01-15")).toBe(false);
    });

    it("should handle first column correctly", () => {
      // 1/2 column (index 0) has ●
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["●", "×", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-02")).toBe(true);
    });

    it("should handle last column correctly", () => {
      // 1/4 column (index 2) has ●
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "×", "●"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-04")).toBe(true);
    });

    it("should check all time slots in target column", () => {
      // 1/3 column has × at 12:00 but ● at 13:00
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "×", "×"],
          ["×", "●", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-03")).toBe(true);
    });

    it("should handle double-digit months", () => {
      // 12/25 column has ●
      const html = createSelectTypeHtml(
        ["12/24", "12/25", "12/26"],
        [
          ["×", "●", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-12-25")).toBe(true);
    });

    it("should handle double-digit days", () => {
      // 1/15 column has ●
      const html = createSelectTypeHtml(
        ["1/14", "1/15", "1/16"],
        [
          ["×", "●", "×"],
          ["×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-15")).toBe(true);
    });

    it("should handle empty cells correctly", () => {
      // 1/3 column has empty cells (no marker)
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["●", "", "●"],
          ["●", "", "●"],
        ]
      );
      expect(detectAvailability(html, "2025-01-03")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle week spanning months", () => {
      // Calendar shows end of January and start of February
      const html = createSelectTypeHtml(
        ["1/30", "1/31", "2/1", "2/2"],
        [
          ["×", "×", "●", "×"],
          ["×", "×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-02-01")).toBe(true);
      expect(detectAvailability(html, "2025-01-31")).toBe(false);
    });

    it("should handle 7-day week view", () => {
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4", "1/5", "1/6", "1/7", "1/8"],
        [
          ["×", "×", "×", "×", "●", "×", "×"],
          ["×", "×", "×", "×", "×", "×", "×"],
        ]
      );
      expect(detectAvailability(html, "2025-01-06")).toBe(true);
      expect(detectAvailability(html, "2025-01-05")).toBe(false);
    });

    it("should not have false positives from legend section", () => {
      // The legend section contains ● and ▲ but shouldn't trigger availability
      // when there's no actual availability in the calendar cells
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "×", "×"],
          ["×", "×", "×"],
        ]
      );
      // This tests that the legend symbols don't cause false positives
      expect(detectAvailability(html)).toBe(false);
    });

    it("should handle multiple time slots with mixed availability", () => {
      // Realistic scenario: some times available, some not
      const html = createSelectTypeHtml(
        ["1/2", "1/3", "1/4"],
        [
          ["×", "×", "×"], // 12:00
          ["×", "×", "×"], // 13:00
          ["×", "×", "●"], // 14:00 - only 1/4 has availability
          ["×", "×", "×"], // 15:00
        ]
      );
      expect(detectAvailability(html, "2025-01-04")).toBe(true);
      expect(detectAvailability(html, "2025-01-02")).toBe(false);
      expect(detectAvailability(html, "2025-01-03")).toBe(false);
    });
  });
});

/**
 * Snapshot of the real reservation page, week of 2026-08-23.
 *
 * Grid as rendered (rows 12:00-21:00, columns 8/23-8/29):
 *   8/23 ×××× ▲ ×××× ●   8/24 ●●●●● ▲ ×× ▲ ●   8/25 all ●   8/26-8/29 not yet open
 */
const LIVE_FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/selecttype-week.html", import.meta.url)),
  "utf8"
);

describe("parseCalendar (real page snapshot)", () => {
  const days = parseCalendar(LIVE_FIXTURE, "2026-08-23");

  it("resolves every rendered column to a full date", () => {
    expect(days.map((day) => day.date)).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("collects only the bookable slots for a partly booked day", () => {
    const day = days.find((entry) => entry.date === "2026-08-23");
    expect(day?.slots.map((slot) => `${slot.time}${slot.marker}`)).toEqual([
      "16:00▲",
      "21:00●",
    ]);
  });

  it("reads slot times and remaining seats from the page", () => {
    const day = days.find((entry) => entry.date === "2026-08-24");
    expect(day?.slots[0]).toMatchObject({
      time: "12:00",
      marker: "●",
      seats: "5人",
      startAt: 1787540400,
    });
  });

  it("treats a fully open day as available in every slot", () => {
    const day = days.find((entry) => entry.date === "2026-08-25");
    expect(day?.slots).toHaveLength(10);
  });

  it("reports days that are not open for booking as empty", () => {
    for (const date of ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"]) {
      expect(days.find((entry) => entry.date === date)?.slots).toEqual([]);
    }
  });

  it("does not pick up the legend markers", () => {
    expect(LIVE_FIXTURE).toContain('class="cl-sign');
    expect(detectAvailability(LIVE_FIXTURE, "2026-08-27")).toBe(false);
  });

  it("answers detectAvailability per date", () => {
    expect(detectAvailability(LIVE_FIXTURE, "2026-08-23")).toBe(true);
    expect(detectAvailability(LIVE_FIXTURE, "2026-08-25")).toBe(true);
    expect(detectAvailability(LIVE_FIXTURE, "2026-08-26")).toBe(false);
    // Outside the rendered window
    expect(detectAvailability(LIVE_FIXTURE, "2026-09-05")).toBe(false);
  });

  it("resolves the year across the December/January boundary", () => {
    const december = parseCalendar(
      LIVE_FIXTURE.replace(/>8\/2(\d)</g, ">12/2$1<"),
      "2026-12-23"
    );
    expect(december[0].date).toBe("2026-12-23");

    const january = parseCalendar(
      LIVE_FIXTURE.replace(/>8\/2(\d)</g, ">1/$1<"),
      "2026-12-30"
    );
    expect(january[0].date).toBe("2027-01-03");
  });
});

describe("groupIntoWindows", () => {
  it("covers a single date with one window", () => {
    expect(groupIntoWindows(["2026-09-10"])).toEqual(["2026-09-10"]);
  });

  it("packs dates within seven days into one fetch", () => {
    expect(
      groupIntoWindows(["2026-09-10", "2026-09-12", "2026-09-16"])
    ).toEqual(["2026-09-10"]);
    expect(windowEnd("2026-09-10")).toBe("2026-09-16");
  });

  it("starts a new window on the eighth day", () => {
    expect(
      groupIntoWindows(["2026-09-10", "2026-09-17", "2026-09-18"])
    ).toEqual(["2026-09-10", "2026-09-17"]);
  });

  it("sorts and de-duplicates its input", () => {
    expect(
      groupIntoWindows(["2026-09-20", "2026-09-10", "2026-09-20"])
    ).toEqual(["2026-09-10", "2026-09-20"]);
  });

  it("returns nothing for no dates", () => {
    expect(groupIntoWindows([])).toEqual([]);
  });
});

describe("getTargetUrl", () => {
  it("returns the bare page without a date", () => {
    expect(getTargetUrl()).toBe("https://select-type.com/rsv/?id=0AEeQuFE0HM");
  });

  it("jumps the calendar to the requested week", () => {
    expect(getTargetUrl("2026-09-10")).toBe(
      "https://select-type.com/rsv/?id=0AEeQuFE0HM&date=20260910"
    );
  });
});

describe("checkDates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Serves a generated 7-day window for whatever `date=` the caller asks for,
   * and records the requests so the fetch count can be asserted.
   */
  function stubCalendar(available: string[], failFor: string[] = []) {
    const requested: string[] = [];

    vi.stubGlobal("fetch", async (url: string) => {
      const param = new URL(url).searchParams.get("date") ?? "";
      requested.push(param);

      if (failFor.includes(param)) {
        return { ok: false, status: 503, statusText: "Service Unavailable" };
      }

      const start = `${param.slice(0, 4)}-${param.slice(4, 6)}-${param.slice(6, 8)}`;
      const window = Array.from({ length: 7 }, (_, offset) =>
        addDays(start, offset)
      );
      const headers = window.map((date) => {
        const [, month, day] = date.split("-").map((part) => parseInt(part, 10));
        return `${month}/${day}`;
      });
      const row = window.map((date) => (available.includes(date) ? "●" : "×"));

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => createSelectTypeHtml(headers, [row]),
      };
    });

    return requested;
  }

  it("fetches one page for dates inside the same week", async () => {
    const requested = stubCalendar(["2026-09-12"]);

    const report = await checkDates([
      "2026-09-10",
      "2026-09-12",
      "2026-09-16",
    ]);

    expect(requested).toEqual(["20260910"]);
    expect(report.fetches).toBe(1);
    expect(report.byDate["2026-09-12"]).toHaveLength(1);
    expect(report.byDate["2026-09-10"]).toEqual([]);
    expect(report.byDate["2026-09-16"]).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.errors).toEqual([]);
  });

  it("fetches a second page only when a date falls outside the window", async () => {
    const requested = stubCalendar([]);

    await checkDates(["2026-09-10", "2026-09-17"]);

    expect(requested).toEqual(["20260910", "20260917"]);
  });

  it("reports a failed window instead of silently claiming no availability", async () => {
    stubCalendar(["2026-09-10"], ["20260910"]);

    const report = await checkDates(["2026-09-10"]);

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("2026-09-10");
    expect(report.byDate).toEqual({});
    // Not "missing" either: we simply do not know.
    expect(report.missing).toEqual([]);
  });
});
