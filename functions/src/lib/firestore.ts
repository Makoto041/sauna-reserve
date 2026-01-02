/**
 * Firestore access utilities
 */

import { getFirestore } from "firebase-admin/firestore";
import type {
  LineTargetDoc,
  WatchConfigDoc,
  WatchStateDoc,
} from "../types/index.js";

// Document paths
const LINE_TARGET_PATH = "line/target";
const WATCH_CONFIG_PATH = "watch/config";
const WATCH_STATE_PATH = "watch/state";

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

/**
 * Updates the watch config enabled status.
 */
export async function setWatchEnabled(enabled: boolean): Promise<void> {
  const db = getFirestore();
  const data: Partial<WatchConfigDoc> = {
    enabled,
    updatedAt: Date.now(),
  };
  await db.doc(WATCH_CONFIG_PATH).set(data, { merge: true });
}

/**
 * Sets the interval for monitoring.
 * @param intervalMinutes - Interval in minutes (1-60)
 */
export async function setIntervalMinutes(
  intervalMinutes: number
): Promise<void> {
  const db = getFirestore();
  await db.doc(WATCH_CONFIG_PATH).set(
    {
      intervalMinutes,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Sets the target date for monitoring.
 * @param targetDate - Date in YYYY-MM-DD format, or null to clear
 */
export async function setTargetDate(targetDate: string | null): Promise<void> {
  const db = getFirestore();
  const docRef = db.doc(WATCH_CONFIG_PATH);

  if (targetDate === null) {
    // Remove targetDate field
    const { FieldValue } = await import("firebase-admin/firestore");
    await docRef.update({
      targetDate: FieldValue.delete(),
      updatedAt: Date.now(),
    });
  } else {
    await docRef.set(
      {
        targetDate,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }
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
    intervalMinutes: 2,
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
 * Updates the watch state.
 */
export async function updateWatchState(
  has: boolean,
  notified: boolean
): Promise<void> {
  const db = getFirestore();
  const now = Date.now();
  const data: WatchStateDoc = {
    has,
    checkedAt: now,
    ...(notified ? { lastNotifiedAt: now } : {}),
  };
  await db.doc(WATCH_STATE_PATH).set(data, { merge: true });
}
