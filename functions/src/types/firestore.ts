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
  intervalMinutes?: number;
  targetDate?: string; // YYYY-MM-DD format (e.g., "2025-01-15")
  updatedAt: number;
}

/** watch/state document */
export interface WatchStateDoc {
  has: boolean;
  checkedAt: number;
  lastNotifiedAt?: number;
}
