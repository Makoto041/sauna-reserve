/**
 * Watch Scheduler Handler
 *
 * Ticks every minute and honours the user's `intervalMinutes` setting, so the
 * interval configured over LINE is the interval that is actually used. Work is
 * skipped as early as possible when monitoring is off, paused, or throttled.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import {
  checkDates,
  checkCurrentWeek,
  getWatchConfig,
  getWatchState,
  updateWatchState,
  touchWatchState,
  prunePastTargetDates,
  setWatchEnabled,
  getLineTarget,
  pushMessage,
  availabilityNotification,
  DEFAULT_INTERVAL_MINUTES,
  jstHour,
  todayJST,
  type AvailabilityHit,
} from "../lib/index.js";

// Define secrets
const lineChannelAccessToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");

/** JST hours during which checks are skipped when nightPause is on. */
const NIGHT_PAUSE_UNTIL_HOUR = 6;

/**
 * Tolerance on the interval check. Scheduler ticks jitter by a few seconds, so
 * without slack a 2-minute interval would silently become 3 minutes.
 */
const INTERVAL_SLACK_MS = 30_000;

const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 60;

function clampInterval(minutes: number | undefined): number {
  if (minutes === undefined || !Number.isFinite(minutes)) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes));
}

/**
 * Scheduled function. The tick is fixed at one minute; the effective check
 * frequency comes from `watch/config.intervalMinutes`.
 */
export const watchScheduler = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Tokyo",
    secrets: [lineChannelAccessToken],
    region: "asia-northeast1",
    timeoutSeconds: 120,
    retryCount: 0, // Don't retry on failure
  },
  async () => {
    const startTime = Date.now();

    try {
      // Step 1: monitoring must be on. Cheapest possible exit.
      const config = await getWatchConfig();
      if (!config?.enabled) {
        return;
      }

      // Step 2: night pause (JST 00:00-05:59 by default).
      const nightPause = config.nightPause ?? true;
      if (nightPause && jstHour(startTime) < NIGHT_PAUSE_UNTIL_HOUR) {
        logger.debug("Night pause, skipping check");
        return;
      }

      // Step 3: honour the configured interval.
      const intervalMinutes = clampInterval(config.intervalMinutes);
      const previousState = await getWatchState();
      const sinceLastCheck = startTime - (previousState?.checkedAt ?? 0);
      if (sinceLastCheck < intervalMinutes * 60_000 - INTERVAL_SLACK_MS) {
        return;
      }

      // Step 4: someone has to receive the notification.
      const target = await getLineTarget();
      if (!target?.userId) {
        logger.warn("No target user registered, skipping");
        return;
      }

      const accessToken = lineChannelAccessToken.value();
      const today = todayJST(startTime);

      // Step 5: drop dates that have already passed.
      const configuredDates = [...(config.targetDates ?? [])].sort();
      let targetDates = configuredDates;
      if (configuredDates.some((date) => date < today)) {
        const pruned = await prunePastTargetDates(today);
        targetDates = configuredDates.filter((date) => !pruned.includes(date));
        logger.info("Pruned past target dates", { pruned });

        if (targetDates.length === 0) {
          await setWatchEnabled(false);
          await updateWatchState([], false, previousState?.lastNotifiedAt);
          await pushMessage(
            accessToken,
            target.userId,
            "監視していた日付がすべて過去日になったため、監視を停止しました。\n新しい日付を追加して「開始」を押してください。"
          );
          return;
        }
      }

      // Step 6: check availability (one page fetch per 7-day window).
      const report =
        targetDates.length > 0
          ? await checkDates(targetDates)
          : await checkCurrentWeek();

      if (report.errors.length > 0) {
        logger.error("Availability check had failures", {
          errors: report.errors,
        });
      }

      // Nothing was learned: record the attempt and keep the previous state so
      // a transient outage cannot look like "everything became unavailable"
      // and then re-notify on recovery.
      if (
        report.errors.length > 0 &&
        (targetDates.length === 0 || Object.keys(report.byDate).length === 0)
      ) {
        await touchWatchState();
        return;
      }

      // Step 7: work out what is newly available.
      // Windows that failed to load keep their previous value so a transient
      // error cannot trigger a duplicate notification once the site recovers.
      const previouslyAvailable = previousState?.availableDates ?? [];
      const checked = new Set(Object.keys(report.byDate));
      const unresolved =
        targetDates.length > 0
          ? targetDates.filter(
              (date) => !checked.has(date) && !report.missing.includes(date)
            )
          : [];

      const availableNow = [
        ...Object.entries(report.byDate)
          .filter(([, slots]) => slots.length > 0)
          .map(([date]) => date),
        ...previouslyAvailable.filter((date) => unresolved.includes(date)),
      ].sort();

      const newlyAvailable = availableNow.filter(
        (date) => !previouslyAvailable.includes(date)
      );

      logger.info("Availability check result", {
        checkedDates: targetDates.length || "current-week",
        fetches: report.fetches,
        availableNow,
        newlyAvailable,
      });

      // Step 8: notify only on a false -> true transition, per date.
      let notified = false;
      if (newlyAvailable.length > 0) {
        const hits: AvailabilityHit[] = newlyAvailable.map((date) => ({
          date,
          slots: report.byDate[date] ?? [],
        }));
        try {
          await pushMessage(
            accessToken,
            target.userId,
            availabilityNotification(hits)
          );
          notified = true;
          logger.info("Notification sent", { dates: newlyAvailable });
        } catch (err) {
          // State is still recorded below; the next transition will retry.
          logger.error("Failed to send notification", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Step 9: always record the check, so a failing site is not hammered.
      await updateWatchState(
        availableNow,
        notified,
        previousState?.lastNotifiedAt
      );

      logger.info("Watch scheduler completed", {
        duration: Date.now() - startTime,
      });
    } catch (err) {
      logger.error("Watch scheduler error", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // Let Cloud Functions surface the failure
    }
  }
);
