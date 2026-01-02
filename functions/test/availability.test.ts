import { describe, it, expect } from "vitest";
import { detectAvailability } from "../src/lib/availability.js";

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

  describe("with targetDate filter", () => {
    it("should return true when target date has availability", () => {
      const html = `
        <html>
          <body>
            <div class="calendar">
              <div class="day">14</div><span>×</span>
              <div class="day">15</div><span>●</span>
              <div class="day">16</div><span>×</span>
            </div>
          </body>
        </html>
      `;
      expect(detectAvailability(html, "2025-01-15")).toBe(true);
    });

    it("should return false when target date has no availability", () => {
      const html = `
        <html>
          <body>
            <div class="calendar">
              <div class="day">14</div><span>●</span>
              <div class="day">15</div><span>×</span>
              <div class="day">16</div><span>●</span>
            </div>
          </body>
        </html>
      `;
      expect(detectAvailability(html, "2025-01-15")).toBe(false);
    });

    it("should return true when target date has partial availability (▲)", () => {
      const html = `
        <html>
          <body>
            <table>
              <tr><td>15</td><td>▲</td></tr>
              <tr><td>16</td><td>×</td></tr>
            </table>
          </body>
        </html>
      `;
      expect(detectAvailability(html, "2025-01-15")).toBe(true);
    });

    it("should handle calendar-style HTML", () => {
      const html = `
        <div class="month">1月</div>
        <table class="calendar">
          <tr>
            <td class="day"><span>14</span><div class="status">×</div></td>
            <td class="day"><span>15</span><div class="status">●</div></td>
            <td class="day"><span>16</span><div class="status">×</div></td>
          </tr>
        </table>
      `;
      expect(detectAvailability(html, "2025-01-15")).toBe(true);
      expect(detectAvailability(html, "2025-01-14")).toBe(false);
    });

    it("should return false when date is not found", () => {
      const html = `
        <div class="calendar">
          <div>1</div><span>●</span>
          <div>2</div><span>●</span>
        </div>
      `;
      expect(detectAvailability(html, "2025-01-15")).toBe(false);
    });
  });
});
