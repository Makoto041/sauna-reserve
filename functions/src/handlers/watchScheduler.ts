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
  monitoringStoppedMessage,
  splitPastDates,
  slotKey,
  dateOfSlotKey,
  datesOfSlots,
  slotsToRemember,
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

      // Claim the tick before doing any slow work. Without this a run that
      // outlives the one-minute tick would let the next tick pass the throttle
      // on the old checkedAt and fetch (and notify) twice.
      await touchWatchState();

      const accessToken = lineChannelAccessToken.value();
      const today = todayJST(startTime);
      const target = await getLineTarget();

      // Step 4: drop dates that have already passed. When that leaves nothing
      // to watch, stop monitoring rather than checking an empty schedule (or,
      // worse, silently falling back to watching every date).
      const configuredDates = [...(config.targetDates ?? [])].sort();
      const { future: targetDates, past: expired } = splitPastDates(
        configuredDates,
        today
      );

      if (expired.length > 0) {
        await prunePastTargetDates(today);
        logger.info("Pruned past target dates", { expired });
      }

      if (configuredDates.length > 0 && targetDates.length === 0) {
        await setWatchEnabled(false);
        await updateWatchState([], false, previousState?.lastNotifiedAt);
        logger.info("All target dates expired, monitoring disabled", {
          expired,
        });
        if (target?.userId) {
          await pushMessage(
            accessToken,
            target.userId,
            monitoringStoppedMessage(expired)
          );
        }
        return;
      }

      // Step 5: someone has to receive the notification.
      if (!target?.userId) {
        logger.warn("No target user registered, skipping");
        return;
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

      // Nothing was learned: the tick is already recorded, so keep the previous
      // state rather than letting a transient outage look like "everything
      // became unavailable" and re-notify on recovery.
      if (
        report.errors.length > 0 &&
        (targetDates.length === 0 || Object.keys(report.byDate).length === 0)
      ) {
        return;
      }

      // Step 7: work out what is newly open, slot by slot.
      // Windows that failed to load keep their previous value so a transient
      // error cannot trigger a duplicate notification once the site recovers.
      const previousSlots = previousState?.availableSlots ?? [];
      const checked = new Set(Object.keys(report.byDate));
      const unresolved =
        targetDates.length > 0
          ? targetDates.filter(
              (date) => !checked.has(date) && !report.missing.includes(date)
            )
          : [];

      const availableNow = [
        ...Object.entries(report.byDate).flatMap(([date, slots]) =>
          slots.map((slot) => slotKey(date, slot))
        ),
        ...previousSlots.filter((key) =>
          unresolved.includes(dateOfSlotKey(key))
        ),
      ].sort();

      // A state document from before slot-level tracking cannot say which
      // slots were announced, so everything open counts as new. That re-sends
      // the current openings once, which beats staying quiet about them.
      const knownSlots = new Set(previousSlots);
      const newlyAvailable = availableNow.filter((key) => !knownSlots.has(key));

      logger.info("Availability check result", {
        checkedDates: targetDates.length || "current-week",
        fetches: report.fetches,
        availableNow,
        newlyAvailable,
      });

      // Step 8: notify only about slots that just opened.
      let notified = false;
      if (newlyAvailable.length > 0) {
        const newKeys = new Set(newlyAvailable);
        const hits: AvailabilityHit[] = datesOfSlots(newlyAvailable).map(
          (date) => ({
            date,
            slots: (report.byDate[date] ?? []).filter((slot) =>
              newKeys.has(slotKey(date, slot))
            ),
          })
        );
        try {
          await pushMessage(
            accessToken,
            target.userId,
            availabilityNotification(hits)
          );
          notified = true;
          logger.info("Notification sent", { slots: newlyAvailable });
        } catch (err) {
          // The slots stay unrecorded below, so the next tick tries again.
          logger.error("Failed to send notification", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Step 9: always record the check, so a failing site is not hammered.
      // Slots whose push failed are left out so they are retried next tick.
      await updateWatchState(
        slotsToRemember(availableNow, newlyAvailable, notified),
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
