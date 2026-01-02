import { describe, it, expect } from "vitest";
import { detectAvailability } from "../src/lib/availability.js";

describe("detectAvailability", () => {
  it("should return true when ● is present", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>10:00</td><td>●</td></tr>
            <tr><td>11:00</td><td>×</td></tr>
          </table>
        </body>
      </html>
    `;
    expect(detectAvailability(html)).toBe(true);
  });

  it("should return true when ▲ is present", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>10:00</td><td>▲</td></tr>
            <tr><td>11:00</td><td>×</td></tr>
          </table>
        </body>
      </html>
    `;
    expect(detectAvailability(html)).toBe(true);
  });

  it("should return true when both ● and ▲ are present", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>10:00</td><td>●</td></tr>
            <tr><td>11:00</td><td>▲</td></tr>
            <tr><td>12:00</td><td>×</td></tr>
          </table>
        </body>
      </html>
    `;
    expect(detectAvailability(html)).toBe(true);
  });

  it("should return false when only × is present", () => {
    const html = `
      <html>
        <body>
          <table>
            <tr><td>10:00</td><td>×</td></tr>
            <tr><td>11:00</td><td>×</td></tr>
          </table>
        </body>
      </html>
    `;
    expect(detectAvailability(html)).toBe(false);
  });

  it("should return false when no availability markers are present", () => {
    const html = `
      <html>
        <body>
          <p>予約可能な枠がありません。</p>
        </body>
      </html>
    `;
    expect(detectAvailability(html)).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(detectAvailability("")).toBe(false);
  });

  it("should handle plain text with markers", () => {
    expect(detectAvailability("予約可能: ●")).toBe(true);
    expect(detectAvailability("残りわずか: ▲")).toBe(true);
    expect(detectAvailability("満席: ×")).toBe(false);
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
