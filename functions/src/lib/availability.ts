/**
 * Availability detection logic for SelectType reservation pages
 *
 * SelectType HTML structure:
 * - Header table (cl-header): <th class="cl-day"><span>1/2<span>(金)</span></span></th>
 * - Data table (cl-container): <td class="cl-day"><div class="cl-day-content"><span class="symbol-black">●</span></div></td>
 * - Markers: ● (symbol-black) = available, ▲ = limited, × (symbol-gray) = closed
 */

const TARGET_URL = "https://select-type.com/rsv/?id=0AEeQuFE0HM";

/**
 * Extracts column index for a target date from SelectType calendar header.
 * SelectType uses format "M/D" (e.g., "1/15", "12/3") in header cells.
 *
 * @param html - The HTML content
 * @param month - Target month (1-12)
 * @param day - Target day (1-31)
 * @returns Column index (0-based, excluding time column) or -1 if not found
 */
function findDateColumnIndex(html: string, month: number, day: number): number {
  // SelectType header format: <th class="cl-day..."><span...>M/D<span...>(曜日)</span></span></th>
  // Pattern: look for date in header cells
  const dateStr = `${month}/${day}`;

  // Find all cl-day header cells and their dates
  const headerPattern =
    /<th[^>]*class="[^"]*cl-day[^"]*"[^>]*>[\s\S]*?<\/th>/gi;
  const headers = html.match(headerPattern) || [];

  for (let i = 0; i < headers.length; i++) {
    // Check if this header contains our target date
    // Date appears as "M/D" followed by day-of-week in parentheses
    if (headers[i].includes(`>${dateStr}<`) || headers[i].includes(`>${dateStr}(`)) {
      return i;
    }
    // Also check for format without tags: >1/15<span
    const dateMatch = headers[i].match(/>(\d{1,2}\/\d{1,2})</);
    if (dateMatch && dateMatch[1] === dateStr) {
      return i;
    }
  }

  return -1;
}

/**
 * Checks if a specific column has availability markers (● or ▲).
 *
 * @param html - The HTML content
 * @param columnIndex - The column index to check (0-based, excluding time column)
 * @returns true if the column has ● or ▲
 */
function checkColumnAvailability(html: string, columnIndex: number): boolean {
  // Find all data rows in cl-container table
  const rowPattern = /<tr>[\s\S]*?<\/tr>/gi;
  const containerMatch = html.match(
    /<table[^>]*class="[^"]*cl-container[^"]*"[^>]*>[\s\S]*?<\/table>/i
  );

  if (!containerMatch) {
    return false;
  }

  const containerHtml = containerMatch[0];
  const rows = containerHtml.match(rowPattern) || [];

  for (const row of rows) {
    // Extract cl-day cells from this row (skip cl-time cell)
    const cellPattern = /<td[^>]*class="[^"]*cl-day[^"]*"[^>]*>[\s\S]*?<\/td>/gi;
    const cells = row.match(cellPattern) || [];

    if (columnIndex < cells.length) {
      const targetCell = cells[columnIndex];
      // Check for availability markers
      // ● appears as symbol-black, ▲ also indicates availability
      if (targetCell.includes("●") || targetCell.includes("▲")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects if there is availability based on HTML content.
 *
 * @param html - The HTML content to check
 * @param targetDate - Optional date to check (YYYY-MM-DD format)
 * @returns true if availability is detected
 */
export function detectAvailability(
  html: string,
  targetDate?: string
): boolean {
  if (!targetDate) {
    // No date filter: check cl-container table cells for availability
    // This avoids false positives from the legend section
    const containerMatch = html.match(
      /<table[^>]*class="[^"]*cl-container[^"]*"[^>]*>[\s\S]*?<\/table>/i
    );

    if (containerMatch) {
      // Check only within calendar cells (cl-day-content)
      const containerHtml = containerMatch[0];
      // Look for ● or ▲ within cl-day-content divs
      const cellContentPattern =
        /<div[^>]*class="[^"]*cl-day-content[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
      const cellContents = containerHtml.match(cellContentPattern) || [];

      for (const cell of cellContents) {
        if (cell.includes("●") || cell.includes("▲")) {
          return true;
        }
      }
      return false;
    }

    // Fallback for non-SelectType HTML or simple markers
    // Only match ● or ▲ that appear to be in content, not in legend
    return html.includes(">●<") || html.includes(">▲<");
  }

  // Parse target date
  const [, month, day] = targetDate.split("-").map((s) => parseInt(s, 10));

  // Find which column contains our target date
  const columnIndex = findDateColumnIndex(html, month, day);

  if (columnIndex === -1) {
    // Target date not found in current calendar view
    // This could mean the date is not in the displayed week
    return false;
  }

  // Check if that column has any availability
  return checkColumnAvailability(html, columnIndex);
}

/**
 * Fetches the reservation page and checks for availability.
 *
 * @param targetDate - Optional date to check (YYYY-MM-DD format)
 * @returns Object containing availability status and any error
 */
export async function checkAvailability(targetDate?: string): Promise<{
  hasAvailability: boolean;
  error?: string;
}> {
  try {
    // Build URL - add date parameter if specified
    let url = TARGET_URL;
    if (targetDate) {
      // SelectType may support date parameter - try adding it
      // Format: YYYYMMDD or YYYY-MM-DD depending on the site
      const dateParam = targetDate.replace(/-/g, "");
      url = `${TARGET_URL}&date=${dateParam}`;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SaunaReserveBot/1.0; +notification-only)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      return {
        hasAvailability: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const hasAvailability = detectAvailability(html, targetDate);

    return { hasAvailability };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      hasAvailability: false,
      error: `Fetch error: ${message}`,
    };
  }
}

/**
 * Returns the target URL for inclusion in notifications.
 */
export function getTargetUrl(): string {
  return TARGET_URL;
}
