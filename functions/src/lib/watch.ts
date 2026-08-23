/**
 * Pure decision helpers for the watch scheduler.
 */

import type { Slot } from "./availability.js";

/**
 * Identity of a single bookable slot, as stored in watch/state.
 *
 * Availability is tracked per slot, not per date. A day frequently has one
 * opening for hours while other times come and go; keying on the date alone
 * means only the first of those is ever announced.
 */
export function slotKey(date: string, slot: Slot): string {
  return `${date} ${slot.time}`;
}

/** The calendar day a slot key belongs to. */
export function dateOfSlotKey(key: string): string {
  return key.slice(0, 10);
}

/**
 * Works out which slots may be recorded as "the user knows about this".
 *
 * The state document drives the "notify once per slot" rule, so a slot must
 * only be written there once the notification actually went out. Recording a
 * slot the push failed to deliver would make the next tick treat it as old
 * news and the opening would never be announced.
 *
 * @param availableNow - Slot keys that are currently open
 * @param newlyAvailable - Slot keys being announced this run
 * @param notified - Whether the push succeeded
 * @returns The slot keys to persist
 */
export function slotsToRemember(
  availableNow: string[],
  newlyAvailable: string[],
  notified: boolean
): string[] {
  if (notified || newlyAvailable.length === 0) {
    return availableNow;
  }
  return availableNow.filter((key) => !newlyAvailable.includes(key));
}

/** The distinct days covered by a set of slot keys, ascending. */
export function datesOfSlots(keys: string[]): string[] {
  return [...new Set(keys.map(dateOfSlotKey))].sort();
}
