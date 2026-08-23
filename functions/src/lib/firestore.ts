/**
 * Firestore access utilities
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type {
  LineTargetDoc,
  WatchConfigDoc,
  WatchStateDoc,
} from "../types/index.js";

// Document paths
const LINE_TARGET_PATH = "line/target";
const WATCH_CONFIG_PATH = "watch/config";
const WATCH_STATE_PATH = "watch/state";

/** Fallback interval when the config has never been written. */
export const DEFAULT_INTERVAL_MINUTES = 2;

/**
 * Gets the LINE target user document.
 */
export async function getLineTarget(): Promise<LineTargetDoc | null> {
  const db = getFirestore();
  const doc = await db.doc(LINE_TARGET_PATH).get();
  return doc.exists ? (doc.data() as LineTargetDoc) : null;
}

/**
 * Sets the LINE target user.
 */
export async function setLineTarget(userId: string): Promise<void> {
  const db = getFirestore();
  const data: LineTargetDoc = {
    userId,
    updatedAt: Date.now(),
  };
  await db.doc(LINE_TARGET_PATH).set(data);
}

/**
 * Gets the watch config document.
 */
export async function getWatchConfig(): Promise<WatchConfigDoc | null> {
  const db = getFirestore();
  const doc = await db.doc(WATCH_CONFIG_PATH).get();
  return doc.exists ? (doc.data() as WatchConfigDoc) : null;
}

/** Writes fields onto watch/config, creating the document when missing. */
async function mergeWatchConfig(
  fields: Record<string, unknown>
): Promise<void> {
  const db = getFirestore();
  await db
    .doc(WATCH_CONFIG_PATH)
    .set({ ...fields, updatedAt: Date.now() }, { merge: true });
}

/**
 * Updates the watch config enabled status.
 */
export async function setWatchEnabled(enabled: boolean): Promise<void> {
  await mergeWatchConfig({ enabled });
}

/**
 * Sets the interval for monitoring.
 * @param intervalMinutes - Interval in minutes (1-60)
 */
export async function setIntervalMinutes(
  intervalMinutes: number
): Promise<void> {
  await mergeWatchConfig({ intervalMinutes });
}

/**
 * Enables or disables the 00:00-06:00 JST pause.
 */
export async function setNightPause(nightPause: boolean): Promise<void> {
  await mergeWatchConfig({ nightPause });
}

/**
 * Adds target dates for monitoring in a single atomic write.
 *
 * @param dates - Dates in YYYY-MM-DD format
 * @returns The full target date list after the write
 */
export async function addTargetDates(dates: string[]): Promise<string[]> {
  if (dates.length === 0) {
    return (await getWatchConfig())?.targetDates ?? [];
  }
  await mergeWatchConfig({ targetDates: FieldValue.arrayUnion(...dates) });
  const updated = (await getWatchConfig())?.targetDates ?? [];
  return [...updated].sort();
}

/**
 * Removes a target date from monitoring.
 *
 * @param targetDate - Date in YYYY-MM-DD format
 * @returns Whether the date was present
 */
export async function removeTargetDate(targetDate: string): Promise<boolean> {
  const current = (await getWatchConfig())?.targetDates ?? [];
  if (!current.includes(targetDate)) {
    return false;
  }
  await mergeWatchConfig({ targetDates: FieldValue.arrayRemove(targetDate) });
  return true;
}

/**
 * Removes dates that are already in the past (JST).
 *
 * @param today - Today's date in JST (YYYY-MM-DD)
 * @returns The dates that were dropped
 */
export async function prunePastTargetDates(today: string): Promise<string[]> {
  const current = (await getWatchConfig())?.targetDates ?? [];
  const stale = current.filter((date) => date < today);
  if (stale.length > 0) {
    await mergeWatchConfig({ targetDates: FieldValue.arrayRemove(...stale) });
  }
  return stale;
}

/**
 * Clears all target dates.
 */
export async function clearTargetDates(): Promise<void> {
  await mergeWatchConfig({ targetDates: FieldValue.delete() });
}

/**
 * Initializes watch config if it doesn't exist.
 */
export async function ensureWatchConfig(): Promise<WatchConfigDoc> {
  const db = getFirestore();
  const docRef = db.doc(WATCH_CONFIG_PATH);
  const doc = await docRef.get();

  if (doc.exists) {
    return doc.data() as WatchConfigDoc;
  }

  const defaultConfig: WatchConfigDoc = {
    enabled: false,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    nightPause: true,
    updatedAt: Date.now(),
  };
  await docRef.set(defaultConfig);
  return defaultConfig;
}

/**
 * Gets the watch state document.
 */
export async function getWatchState(): Promise<WatchStateDoc | null> {
  const db = getFirestore();
  const doc = await db.doc(WATCH_STATE_PATH).get();
  return doc.exists ? (doc.data() as WatchStateDoc) : null;
}

/**
 * Records the outcome of a check.
 *
 * Written with a full overwrite, which also drops the per-date `availableDates`
 * field written by older versions.
 *
 * @param availableSlots - Slot keys ("YYYY-MM-DD HH:MM") that are open now
 * @param notified - Whether a notification was sent this run
 * @param previousNotifiedAt - Existing lastNotifiedAt, preserved when not notifying
 */
export async function updateWatchState(
  availableSlots: string[],
  notified: boolean,
  previousNotifiedAt?: number
): Promise<void> {
  const db = getFirestore();
  const now = Date.now();
  const lastNotifiedAt = notified ? now : previousNotifiedAt;
  const data: WatchStateDoc = {
    has: availableSlots.length > 0,
    checkedAt: now,
    availableSlots,
    ...(lastNotifiedAt !== undefined ? { lastNotifiedAt } : {}),
  };
  await db.doc(WATCH_STATE_PATH).set(data);
}

/**
 * Records that a check ran without touching availability (throttled tick,
 * fetch failure, or paused window).
 */
export async function touchWatchState(): Promise<void> {
  const db = getFirestore();
  await db.doc(WATCH_STATE_PATH).set({ checkedAt: Date.now() }, { merge: true });
}
