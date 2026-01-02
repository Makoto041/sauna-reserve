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
  addTargetDate,
  removeTargetDate,
  clearTargetDates,
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
 * Formats multiple dates for display.
 */
function formatDatesForDisplay(dates: string[]): string {
  return dates.map(formatDateForDisplay).join("\n");
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
    // Check for remove date command (削除 1/15 or 削除1/15)
    const removeMatch = rawText.match(/^削除\s*(.+)$/);
    if (removeMatch) {
      const parsedDate = parseDate(removeMatch[1]);
      if (parsedDate) {
        const removed = await removeTargetDate(parsedDate);
        const displayDate = formatDateForDisplay(parsedDate);
        if (removed) {
          const config = await getWatchConfig();
          const remaining = config?.targetDates?.length ?? 0;
          await replyMessage(
            accessToken,
            replyToken,
            `${displayDate} を監視対象から削除しました。\n\n` +
              `残りの監視日: ${remaining}件`
          );
          logger.info("Target date removed", { userId, targetDate: parsedDate });
        } else {
          await replyMessage(
            accessToken,
            replyToken,
            `${displayDate} は監視対象に含まれていません。`
          );
        }
        return;
      }
    }

    // Check if it's a date command (add date)
    const parsedDate = parseDate(rawText);
    if (parsedDate) {
      await addTargetDate(parsedDate);
      const displayDate = formatDateForDisplay(parsedDate);
      const config = await getWatchConfig();
      const total = config?.targetDates?.length ?? 1;
      await replyMessage(
        accessToken,
        replyToken,
        `${displayDate} を監視対象に追加しました。\n\n` +
          `現在の監視日数: ${total}件\n\n` +
          "「on」で監視開始\n" +
          "「status」で一覧確認\n" +
          "「削除 1/15」で日付を削除"
      );
      logger.info("Target date added", { userId, targetDate: parsedDate });
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
            "日付を送信: 監視日を追加（例: 1/15）\n" +
            "複数日程を追加できます\n" +
            "「on」で監視開始\n" +
            "「off」で監視停止\n" +
            "「status」で状態確認\n" +
            "「使い方」で詳細を表示"
        );
        logger.info("User registered", { userId });
        break;
      }

      case "on": {
        const config = await getWatchConfig();
        await setWatchEnabled(true);
        const dates = config?.targetDates;
        const dateInfo =
          dates && dates.length > 0
            ? `\n監視日:\n${formatDatesForDisplay(dates)}`
            : "\n（全日程を監視）";
        await replyMessage(
          accessToken,
          replyToken,
          `監視を開始しました。${dateInfo}\n\n空きが出たら通知します。`
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
        await clearTargetDates();
        await replyMessage(
          accessToken,
          replyToken,
          "全ての監視日を削除しました。\n全日程を監視対象にします。"
        );
        logger.info("All target dates cleared", { userId });
        break;
      }

      case "status": {
        const config = await getWatchConfig();
        const status = config?.enabled ? "ON（監視中）" : "OFF（停止中）";
        const dates = config?.targetDates;
        const dateInfo =
          dates && dates.length > 0
            ? `\n監視日（${dates.length}件）:\n${formatDatesForDisplay(dates)}`
            : "\n監視日: 全日程";
        await replyMessage(
          accessToken,
          replyToken,
          `現在の状態: ${status}${dateInfo}\n\n` +
            "日付を送信で追加\n" +
            "「削除 1/15」で削除\n" +
            "「clear」で全削除"
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
            "■ 監視日の管理（複数可）\n" +
            "「1/15」: 1月15日を追加\n" +
            "「削除 1/15」: 1月15日を削除\n" +
            "「clear」: 全日付を削除\n\n" +
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
