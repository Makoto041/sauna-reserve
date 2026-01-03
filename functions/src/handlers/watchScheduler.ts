/**
 * Watch Scheduler Handler
 *
 * Runs every 1 minute to check availability and send notifications.
 * Uses intervalMinutes setting from Firestore to control actual check frequency.
 * Respects the enabled flag to minimize unnecessary API calls.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import {
  checkAvailability,
  getTargetUrl,
  getWatchConfig,
  getWatchState,
  updateWatchState,
  getLineTarget,
  pushMessage,
} from "../lib/index.js";

// Define secrets
const lineChannelAccessToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");

/**
 * Scheduled function that runs every 1 minute.
 * The actual check interval is controlled by intervalMinutes in Firestore.
 */
export const watchScheduler = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Tokyo",
    secrets: [lineChannelAccessToken],
    region: "asia-northeast1",
    retryCount: 0, // Don't retry on failure
  },
  async () => {
    const startTime = Date.now();
    logger.info("Watch scheduler started");

    try {
      // Step 1: Check if monitoring is enabled
      const config = await getWatchConfig();
      if (!config?.enabled) {
        logger.info("Monitoring is disabled, skipping check");
        return;
      }

      // Step 1.5: Check if enough time has passed since last check (dynamic interval)
      const intervalMinutes = config.intervalMinutes ?? 2;
      const state = await getWatchState();
      if (state?.checkedAt) {
        const elapsedMinutes = (startTime - state.checkedAt) / (1000 * 60);
        logger.info("Interval check", {
          elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
          intervalMinutes,
          threshold: intervalMinutes - 0.5,
        });
        if (elapsedMinutes < intervalMinutes - 0.5) {
          // Allow 30 seconds tolerance
          logger.info("Skipping check, interval not reached");
          return;
        }
      }

      // Step 2: Get target user
      const target = await getLineTarget();
      if (!target?.userId) {
        logger.warn("No target user registered, skipping");
        return;
      }

      // Step 3: Check availability for each target date (or all dates if none specified)
      const targetDates = config.targetDates;
      let hasAvailability = false;
      // Map of date -> time slots
      const availableSlotsMap: Map<string, string[]> = new Map();

      if (targetDates && targetDates.length > 0) {
        // Check each target date
        for (const targetDate of targetDates) {
          const result = await checkAvailability(targetDate);
          if (result.error) {
            logger.error("Availability check failed", {
              error: result.error,
              targetDate,
            });
            continue;
          }
          if (result.hasAvailability) {
            hasAvailability = true;
            availableSlotsMap.set(targetDate, result.timeSlots);
          }
        }
        logger.info("Availability check result", {
          hasAvailability,
          availableDates: Array.from(availableSlotsMap.keys()),
          checkedDates: targetDates.length,
        });
      } else {
        // Check all dates
        const result = await checkAvailability(undefined);
        if (result.error) {
          logger.error("Availability check failed", { error: result.error });
          return;
        }
        hasAvailability = result.hasAvailability;
        logger.info("Availability check result (all dates)", { hasAvailability });
      }

      // Step 4: Check if target dates changed (reuse state from Step 1.5)
      const previousTargetDates = state?.checkedTargetDates ?? [];
      const currentTargetDates = targetDates ?? [];

      // Normalize for comparison (sort and stringify)
      const prevDatesKey = [...previousTargetDates].sort().join(",");
      const currDatesKey = [...currentTargetDates].sort().join(",");
      const targetDatesChanged = prevDatesKey !== currDatesKey;

      if (targetDatesChanged) {
        logger.info("Target dates changed, resetting state", {
          previous: previousTargetDates,
          current: currentTargetDates,
        });
      }

      // If target dates changed, treat as fresh start (ignore previous availability)
      const hadAvailability = targetDatesChanged ? false : (state?.has ?? false);

      // Step 5: Determine if notification is needed
      // Only notify when state changes from false to true
      const shouldNotify = !hadAvailability && hasAvailability;

      if (shouldNotify) {
        logger.info("Availability detected, sending notification");

        const accessToken = lineChannelAccessToken.value();
        const targetUrl = getTargetUrl();

        // Format dates and time slots for message
        let dateInfo = "";
        if (availableSlotsMap.size > 0) {
          const formattedEntries: string[] = [];
          for (const [date, slots] of availableSlotsMap) {
            const [year, month, day] = date.split("-");
            const dateStr = `${year}年${parseInt(month, 10)}月${parseInt(day, 10)}日`;
            if (slots.length > 0) {
              // Include time slots
              formattedEntries.push(`${dateStr}\n  ${slots.join(", ")}`);
            } else {
              formattedEntries.push(dateStr);
            }
          }
          dateInfo = `以下の日程で空きが見つかりました！\n\n${formattedEntries.join("\n\n")}\n\n`;
        } else {
          dateInfo = "空きが見つかりました！\n\n";
        }

        const message =
          `${dateInfo}` +
          `今すぐ予約ページを確認してください:\n` +
          `${targetUrl}`;

        try {
          await pushMessage(accessToken, target.userId, message);
          logger.info("Notification sent successfully");
        } catch (err) {
          logger.error("Failed to send notification", { error: err });
          // Still update state even if notification fails
        }
      } else if (hasAvailability) {
        logger.info("Availability still present, not re-notifying");
      } else {
        logger.info("No availability");
      }

      // Step 6: Update state with current target dates
      await updateWatchState(hasAvailability, shouldNotify, currentTargetDates);

      const duration = Date.now() - startTime;
      logger.info("Watch scheduler completed", { duration, hasAvailability });
    } catch (err) {
      logger.error("Watch scheduler error", { error: err });
      throw err; // Let Cloud Functions handle the error
    }
  }
);
