/**
 * Firestore document types
 */

/** line/target document */
export interface LineTargetDoc {
  userId: string;
  updatedAt: number;
}

/** watch/config document */
export interface WatchConfigDoc {
  enabled: boolean;
  /** Minutes between checks (1-60). Enforced by watchScheduler, default 2. */
  intervalMinutes?: number;
  /** Array of YYYY-MM-DD (e.g. ["2026-08-23", "2026-08-30"]) */
  targetDates?: string[];
  /** Skip checks between 00:00 and 06:00 JST. Defaults to true. */
  nightPause?: boolean;
  updatedAt: number;
}

/** watch/state document */
export interface WatchStateDoc {
  /** True when any monitored slot was open at the last check. */
  has: boolean;
  checkedAt: number;
  lastNotifiedAt?: number;
  /**
   * Slots ("YYYY-MM-DD HH:MM") that were open at the last check and have
   * already been notified. Keyed per slot rather than per date: a day that
   * already has one opening must still notify when another time frees up.
   */
  availableSlots?: string[];
}
