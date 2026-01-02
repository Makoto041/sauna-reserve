/**
 * Watch Scheduler Handler
 *
 * Runs every 2 minutes to check availability and send notifications.
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
 * Scheduled function that runs every 2 minutes.
 */
export const watchScheduler = onSchedule(
  {
    schedule: "every 2 minutes",
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

      // Step 2: Get target user
      const target = await getLineTarget();
      if (!target?.userId) {
        logger.warn("No target user registered, skipping");
        return;
      }

      // Step 3: Check availability
      const { hasAvailability, error } = await checkAvailability();

      if (error) {
        logger.error("Availability check failed", { error });
        // Don't update state on error to preserve previous state
        return;
      }

      logger.info("Availability check result", { hasAvailability });

      // Step 4: Get previous state
      const previousState = await getWatchState();
      const hadAvailability = previousState?.has ?? false;

      // Step 5: Determine if notification is needed
      // Only notify when state changes from false to true
      const shouldNotify = !hadAvailability && hasAvailability;

      if (shouldNotify) {
        logger.info("Availability detected, sending notification");

        const accessToken = lineChannelAccessToken.value();
        const targetUrl = getTargetUrl();

        const message =
          `空きが見つかりました！\n\n` +
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

      // Step 6: Update state
      await updateWatchState(hasAvailability, shouldNotify);

      const duration = Date.now() - startTime;
      logger.info("Watch scheduler completed", { duration, hasAvailability });
    } catch (err) {
      logger.error("Watch scheduler error", { error: err });
      throw err; // Let Cloud Functions handle the error
    }
  }
);
