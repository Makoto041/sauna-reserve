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
});
