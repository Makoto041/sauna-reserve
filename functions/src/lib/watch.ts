/**
 * Pure decision helpers for the watch scheduler.
 */

/**
 * Works out which dates may be recorded as "the user knows about this".
 *
 * The state document drives the "notify once per date" rule, so a date must
 * only be written there once the notification actually went out. Recording a
 * date the push failed to deliver would make the next tick treat it as old
 * news and the opening would never be announced.
 *
 * @param availableNow - Dates that currently have availability
 * @param newlyAvailable - Dates being announced this run
 * @param notified - Whether the push succeeded
 * @returns The dates to persist
 */
export function datesToRemember(
  availableNow: string[],
  newlyAvailable: string[],
  notified: boolean
): string[] {
  if (notified || newlyAvailable.length === 0) {
    return availableNow;
  }
  return availableNow.filter((date) => !newlyAvailable.includes(date));
}
