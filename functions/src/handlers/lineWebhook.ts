/**
 * LINE Webhook Handler
 *
 * Handles:
 * - "start" command: Register user for notifications
 * - "on" command: Enable monitoring
 * - "off" command: Disable monitoring
 * - "status" command: Show current status
 * - Date commands: Set target date for monitoring (e.g., "1/15", "2025-01-15")
 * - "clear" command: Clear target date
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import type { LineWebhookBody, LineEvent } from "../types/index.js";
import {
  verifySignature,
  replyMessage,
  setLineTarget,
  setWatchEnabled,
  setTargetDate,
  setIntervalMinutes,
  getWatchConfig,
  ensureWatchConfig,
} from "../lib/index.js";

/**
 * Parses various date formats and returns YYYY-MM-DD format.
 * Supports:
 * - "1/15" or "01/15" (assumes current year)
 * - "2025/1/15" or "2025/01/15"
 * - "1-15" or "01-15" (assumes current year)
 * - "2025-1-15" or "2025-01-15"
 *
 * @returns YYYY-MM-DD string or null if invalid
 */
function parseDate(input: string): string | null {
  const trimmed = input.trim();

  // Try MM/DD or M/D format (current year)
  const shortSlash = /^(\d{1,2})\/(\d{1,2})$/;
  const shortSlashMatch = trimmed.match(shortSlash);
  if (shortSlashMatch) {
    const month = parseInt(shortSlashMatch[1], 10);
    const day = parseInt(shortSlashMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try YYYY/MM/DD format
  const longSlash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
  const longSlashMatch = trimmed.match(longSlash);
  if (longSlashMatch) {
    const year = parseInt(longSlashMatch[1], 10);
    const month = parseInt(longSlashMatch[2], 10);
    const day = parseInt(longSlashMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try MM-DD or M-D format (current year)
  const shortDash = /^(\d{1,2})-(\d{1,2})$/;
  const shortDashMatch = trimmed.match(shortDash);
  if (shortDashMatch) {
    const month = parseInt(shortDashMatch[1], 10);
    const day = parseInt(shortDashMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Try YYYY-MM-DD format
  const longDash = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  const longDashMatch = trimmed.match(longDash);
  if (longDashMatch) {
    const year = parseInt(longDashMatch[1], 10);
    const month = parseInt(longDashMatch[2], 10);
    const day = parseInt(longDashMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Formats a date string for display.
 */
function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${year}年${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

/**
 * Parses interval command (e.g., "間隔5", "interval 10", "5分")
 * @returns interval in minutes (1-60) or null if invalid
 */
function parseInterval(input: string): number | null {
  const trimmed = input.trim().toLowerCase();

  // Pattern: "間隔N" or "間隔 N"
  const kanjiMatch = trimmed.match(/^間隔\s*(\d+)$/);
  if (kanjiMatch) {
    const minutes = parseInt(kanjiMatch[1], 10);
    if (minutes >= 1 && minutes <= 60) return minutes;
  }

  // Pattern: "interval N" or "interval N"
  const engMatch = trimmed.match(/^interval\s+(\d+)$/);
  if (engMatch) {
    const minutes = parseInt(engMatch[1], 10);
    if (minutes >= 1 && minutes <= 60) return minutes;
  }

  // Pattern: "N分" (e.g., "5分", "10分")
  const minMatch = trimmed.match(/^(\d+)分$/);
  if (minMatch) {
    const minutes = parseInt(minMatch[1], 10);
    if (minutes >= 1 && minutes <= 60) return minutes;
  }

  return null;
}

// Define secrets
const lineChannelAccessToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const lineChannelSecret = defineSecret("LINE_CHANNEL_SECRET");

/**
 * Processes a single LINE event.
 */
async function processEvent(
  event: LineEvent,
  accessToken: string
): Promise<void> {
  // Only handle text messages
  if (event.type !== "message" || event.message?.type !== "text") {
    logger.info("Ignoring non-text event", { type: event.type });
    return;
  }

  const rawText = event.message.text?.trim() ?? "";
  const text = rawText.toLowerCase();
  const userId = event.source?.userId;
  const replyToken = event.replyToken;

  if (!userId || !replyToken) {
    logger.warn("Missing userId or replyToken");
    return;
  }

  logger.info("Processing command", { text, userId });

  try {
    // Check if it's an interval command first
    const parsedInterval = parseInterval(rawText);
    if (parsedInterval) {
      await setIntervalMinutes(parsedInterval);
      await replyMessage(
        accessToken,
        replyToken,
        `監視間隔を ${parsedInterval}分 に設定しました。\n\n` +
          "※次回のスケジューラー実行から反映されます。"
      );
      logger.info("Interval set", { userId, intervalMinutes: parsedInterval });
      return;
    }

    // Check if it's a date command
    const parsedDate = parseDate(rawText);
    if (parsedDate) {
      await setTargetDate(parsedDate);
      const displayDate = formatDateForDisplay(parsedDate);
      await replyMessage(
        accessToken,
        replyToken,
        `監視日を ${displayDate} に設定しました。\n\n` +
          "「on」で監視開始\n" +
          "「clear」で日付指定を解除"
      );
      logger.info("Target date set", { userId, targetDate: parsedDate });
      return;
    }

    switch (text) {
      case "start": {
        await setLineTarget(userId);
        await ensureWatchConfig();
        await replyMessage(
          accessToken,
          replyToken,
          "登録完了しました！\n\n" +
            "日付を送信: 監視日を指定（例: 1/15）\n" +
            "「on」で監視開始\n" +
            "「off」で監視停止\n" +
            "「status」で状態確認"
        );
        logger.info("User registered", { userId });
        break;
      }

      case "on": {
        const config = await getWatchConfig();
        await setWatchEnabled(true);
        const dateInfo = config?.targetDate
          ? `\n監視日: ${formatDateForDisplay(config.targetDate)}`
          : "\n（全日程を監視）";
        await replyMessage(
          accessToken,
          replyToken,
          `監視を開始しました。${dateInfo}\n空きが出たら通知します。`
        );
        logger.info("Monitoring enabled", { userId });
        break;
      }

      case "off": {
        await setWatchEnabled(false);
        await replyMessage(
          accessToken,
          replyToken,
          "監視を停止しました。\n再開するには「on」と送信してください。"
        );
        logger.info("Monitoring disabled", { userId });
        break;
      }

      case "clear": {
        await setTargetDate(null);
        await replyMessage(
          accessToken,
          replyToken,
          "日付指定を解除しました。\n全日程を監視対象にします。"
        );
        logger.info("Target date cleared", { userId });
        break;
      }

      case "status": {
        const config = await getWatchConfig();
        const status = config?.enabled ? "ON（監視中）" : "OFF（停止中）";
        const dateInfo = config?.targetDate
          ? `\n監視日: ${formatDateForDisplay(config.targetDate)}`
          : "\n監視日: 全日程";
        const intervalInfo = `\n監視間隔: ${config?.intervalMinutes ?? 2}分`;
        await replyMessage(
          accessToken,
          replyToken,
          `現在の状態: ${status}${dateInfo}${intervalInfo}\n\n` +
            "日付を送信で監視日を変更\n" +
            "「5分」等で監視間隔を変更\n" +
            "「clear」で日付指定を解除"
        );
        break;
      }

      case "使い方":
      case "help":
      case "ヘルプ": {
        await replyMessage(
          accessToken,
          replyToken,
          "【サウナ予約監視ボット 使い方】\n\n" +
            "■ 初期設定\n" +
            "「start」: 通知を受け取る登録\n\n" +
            "■ 監視の開始・停止\n" +
            "「on」: 監視を開始\n" +
            "「off」: 監視を停止\n\n" +
            "■ 監視日の指定\n" +
            "「1/15」: 1月15日を監視\n" +
            "「2025/1/15」: 年指定も可\n" +
            "「clear」: 日付指定を解除\n\n" +
            "■ 監視間隔の設定\n" +
            "「5分」: 5分間隔で監視\n" +
            "「間隔10」: 10分間隔で監視\n" +
            "※1〜60分で設定可能\n\n" +
            "■ 状態確認\n" +
            "「status」: 現在の設定を表示"
        );
        break;
      }

      default: {
        await replyMessage(
          accessToken,
          replyToken,
          "コマンドが認識できませんでした。\n\n" +
            "「使い方」と送信すると\n" +
            "使い方の一覧が表示されます。"
        );
        break;
      }
    }
  } catch (err) {
    logger.error("Error processing event", { error: err, text, userId });
    // Try to send error message
    try {
      await replyMessage(
        accessToken,
        replyToken,
        "エラーが発生しました。しばらく待ってから再試行してください。"
      );
    } catch {
      // Ignore reply error
    }
  }
}

/**
 * LINE Webhook HTTP function.
 */
export const lineWebhook = onRequest(
  {
    secrets: [lineChannelAccessToken, lineChannelSecret],
    region: "asia-northeast1",
    maxInstances: 10,
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const accessToken = lineChannelAccessToken.value();
    const channelSecret = lineChannelSecret.value();

    // Verify signature
    const signature = req.headers["x-line-signature"];
    if (typeof signature !== "string") {
      logger.warn("Missing X-Line-Signature header");
      res.status(401).send("Unauthorized");
      return;
    }

    // Get raw body for signature verification
    const rawBody =
      typeof req.rawBody === "string"
        ? req.rawBody
        : req.rawBody?.toString("utf8") ?? JSON.stringify(req.body);

    try {
      const isValid = verifySignature(channelSecret, signature, rawBody);
      if (!isValid) {
        logger.warn("Invalid signature");
        res.status(401).send("Unauthorized");
        return;
      }
    } catch (err) {
      logger.error("Signature verification error", { error: err });
      res.status(401).send("Unauthorized");
      return;
    }

    // Parse body
    const body = req.body as LineWebhookBody;
    const events = body.events ?? [];

    logger.info("Received webhook", { eventCount: events.length });

    // Process events
    for (const event of events) {
      await processEvent(event, accessToken);
    }

    // Always return 200 to LINE
    res.status(200).send("OK");
  }
);
