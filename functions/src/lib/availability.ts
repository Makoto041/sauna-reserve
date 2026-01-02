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
 * Gets available time slots for a specific column.
 *
 * @param html - The HTML content
 * @param columnIndex - The column index to check (0-based, excluding time column)
 * @returns Array of time strings (e.g., ["12:00", "14:00"])
 */
function getColumnAvailableTimeSlots(
  html: string,
  columnIndex: number
): string[] {
  const availableSlots: string[] = [];
  const rowPattern = /<tr>[\s\S]*?<\/tr>/gi;
  const containerMatch = html.match(
    /<table[^>]*class="[^"]*cl-container[^"]*"[^>]*>[\s\S]*?<\/table>/i
  );

  if (!containerMatch) {
    return availableSlots;
  }

  const containerHtml = containerMatch[0];
  const rows = containerHtml.match(rowPattern) || [];

  for (const row of rows) {
    // Extract time from cl-time cell
    const timeMatch = row.match(
      /<td[^>]*class="[^"]*cl-time[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d{1,2}:\d{2})<\/span>[\s\S]*?<\/td>/i
    );
    if (!timeMatch) continue;

    const timeStr = timeMatch[1];

    // Extract cl-day cells from this row
    const cellPattern =
      /<td[^>]*class="[^"]*cl-day[^"]*"[^>]*>[\s\S]*?<\/td>/gi;
    const cells = row.match(cellPattern) || [];

    if (columnIndex < cells.length) {
      const targetCell = cells[columnIndex];
      // Check for availability markers
      if (targetCell.includes("●") || targetCell.includes("▲")) {
        availableSlots.push(timeStr);
      }
    }
  }

  return availableSlots;
}

/**
 * Generic detection: finds if day number and availability marker appear near each other.
 * This handles various HTML structures where the day and marker may be adjacent.
 *
 * @param html - The HTML content
 * @param day - Target day (1-31)
 * @returns true if the day has ● or ▲ nearby
 */
function checkDayAvailabilityGeneric(html: string, day: number): boolean {
  const dayStr = String(day);

  // Strategy 1: Look for day number in element followed by marker in next element
  // Patterns like: <div>15</div><span>●</span> or <span>15</span>...●
  // Match >15< or >15</
  const dayPatterns = [
    new RegExp(`>${dayStr}<`, "g"), // >15<
    new RegExp(`>${dayStr}</`, "g"), // >15</
  ];

  for (const dayPattern of dayPatterns) {
    let match;
    while ((match = dayPattern.exec(html)) !== null) {
      // Check the surrounding context (next 300 characters)
      const startIdx = match.index;
      const endIdx = Math.min(startIdx + 300, html.length);
      const context = html.slice(startIdx, endIdx);

      // Find where the next day number appears (to limit our search)
      // Look for another >number< or >number</ pattern
      let searchEnd = context.length;
      const nextDayMatches = context.matchAll(/>\d{1,2}<|>\d{1,2}<\//g);
      let firstMatch = true;
      for (const nextMatch of nextDayMatches) {
        if (firstMatch) {
          // Skip the first match (it's our target day)
          firstMatch = false;
          continue;
        }
        if (nextMatch.index !== undefined) {
          searchEnd = nextMatch.index;
          break;
        }
      }

      const searchContext = context.slice(0, searchEnd);

      // Check for availability markers
      if (searchContext.includes("●") || searchContext.includes("▲")) {
        return true;
      }
    }
  }

  return false;
}

/** Result of availability detection */
export interface AvailabilityResult {
  hasAvailability: boolean;
  timeSlots: string[]; // Available time slots (e.g., ["12:00", "14:00"])
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
  return detectAvailabilityWithSlots(html, targetDate).hasAvailability;
}

/**
 * Detects availability and returns available time slots.
 *
 * @param html - The HTML content to check
 * @param targetDate - Optional date to check (YYYY-MM-DD format)
 * @returns Object with hasAvailability and timeSlots array
 */
export function detectAvailabilityWithSlots(
  html: string,
  targetDate?: string
): AvailabilityResult {
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
          // For no date filter, we can't easily extract time slots
          return { hasAvailability: true, timeSlots: [] };
        }
      }
      return { hasAvailability: false, timeSlots: [] };
    }

    // Fallback for non-SelectType HTML or simple markers
    // Only match ● or ▲ that appear to be in content, not in legend
    const hasAvailability = html.includes(">●<") || html.includes(">▲<");
    return { hasAvailability, timeSlots: [] };
  }

  // Parse target date
  const [, month, day] = targetDate.split("-").map((s) => parseInt(s, 10));

  // Try SelectType-specific detection first
  const columnIndex = findDateColumnIndex(html, month, day);

  if (columnIndex !== -1) {
    // SelectType format found, check specific column and get time slots
    const timeSlots = getColumnAvailableTimeSlots(html, columnIndex);
    return {
      hasAvailability: timeSlots.length > 0,
      timeSlots,
    };
  }

  // Fallback: generic day-based detection for non-SelectType HTML
  const hasAvailability = checkDayAvailabilityGeneric(html, day);
  return { hasAvailability, timeSlots: [] };
}

/** Result of checkAvailability function */
export interface CheckAvailabilityResult {
  hasAvailability: boolean;
  timeSlots: string[];
  error?: string;
}

/**
 * Fetches the reservation page and checks for availability.
 *
 * @param targetDate - Optional date to check (YYYY-MM-DD format)
 * @returns Object containing availability status, time slots, and any error
 */
export async function checkAvailability(
  targetDate?: string
): Promise<CheckAvailabilityResult> {
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
        timeSlots: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const result = detectAvailabilityWithSlots(html, targetDate);

    return {
      hasAvailability: result.hasAvailability,
      timeSlots: result.timeSlots,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      hasAvailability: false,
      timeSlots: [],
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
