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
  setIntervalMinutes,
  addTargetDate,
  removeTargetDate,
  clearTargetDates,
  getWatchConfig,
  getWatchState,
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

/**
 * Parses multiple dates from input (space or comma separated).
 * Example: "1/2 1/3" or "1/2, 1/3" or "1/2　1/3" (full-width space)
 * @returns Array of YYYY-MM-DD strings (only valid dates)
 */
function parseMultipleDates(input: string): string[] {
  // Split by space (half-width or full-width) or comma
  const parts = input.split(/[\s,、　]+/).filter((p) => p.length > 0);
  const dates: string[] = [];

  for (const part of parts) {
    const parsed = parseDate(part);
    if (parsed && !dates.includes(parsed)) {
      dates.push(parsed);
    }
  }

  return dates.sort();
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
    // Check for interval command (間隔 5 or 5分 or interval 5)
    const intervalMatch = rawText.match(/^(?:間隔\s*|interval\s*)(\d+)$|^(\d+)分$/i);
    if (intervalMatch) {
      const minutes = parseInt(intervalMatch[1] || intervalMatch[2], 10);
      if (minutes >= 1 && minutes <= 60) {
        await setIntervalMinutes(minutes);
        await replyMessage(
          accessToken,
          replyToken,
          `監視間隔を ${minutes}分 に設定しました。`
        );
        logger.info("Interval updated", { userId, intervalMinutes: minutes });
        return;
      } else {
        await replyMessage(
          accessToken,
          replyToken,
          "監視間隔は1〜60分の範囲で指定してください。\n例: 「5分」「間隔 10」"
        );
        return;
      }
    }

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

    // Check if it's a date command (add date - supports multiple dates)
    const parsedDates = parseMultipleDates(rawText);
    if (parsedDates.length > 0) {
      // Add all dates
      for (const date of parsedDates) {
        await addTargetDate(date);
      }
      const config = await getWatchConfig();
      const total = config?.targetDates?.length ?? parsedDates.length;

      if (parsedDates.length === 1) {
        const displayDate = formatDateForDisplay(parsedDates[0]);
        await replyMessage(
          accessToken,
          replyToken,
          `${displayDate} を監視対象に追加しました。\n\n` +
            `現在の監視日数: ${total}件\n\n` +
            "「開始」で監視開始\n" +
            "「状態」で一覧確認\n" +
            "「削除 1/15」で日付を削除"
        );
      } else {
        const displayDates = parsedDates.map(formatDateForDisplay).join("\n");
        await replyMessage(
          accessToken,
          replyToken,
          `${parsedDates.length}件の日付を追加しました:\n${displayDates}\n\n` +
            `現在の監視日数: ${total}件\n\n` +
            "「開始」で監視開始\n" +
            "「状態」で一覧確認"
        );
      }
      logger.info("Target dates added", { userId, targetDates: parsedDates });
      return;
    }

    switch (text) {
      case "start":
      case "登録": {
        await setLineTarget(userId);
        await ensureWatchConfig();
        await replyMessage(
          accessToken,
          replyToken,
          "登録完了しました！\n\n" +
            "日付を送信: 監視日を追加（例: 1/15）\n" +
            "複数日程を追加できます\n" +
            "「開始」で監視開始\n" +
            "「停止」で監視停止\n" +
            "「状態」で状態確認\n" +
            "「使い方」で詳細を表示"
        );
        logger.info("User registered", { userId });
        break;
      }

      case "on":
      case "開始": {
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

      case "off":
      case "停止": {
        await setWatchEnabled(false);
        await replyMessage(
          accessToken,
          replyToken,
          "監視を停止しました。\n再開するには「開始」と送信してください。"
        );
        logger.info("Monitoring disabled", { userId });
        break;
      }

      case "clear":
      case "全削除": {
        await clearTargetDates();
        await replyMessage(
          accessToken,
          replyToken,
          "全ての監視日を削除しました。\n全日程を監視対象にします。"
        );
        logger.info("All target dates cleared", { userId });
        break;
      }

      case "status":
      case "状態": {
        const config = await getWatchConfig();
        const state = await getWatchState();
        const statusText = config?.enabled ? "ON（監視中）" : "OFF（停止中）";
        const dates = config?.targetDates;
        const dateInfo =
          dates && dates.length > 0
            ? `監視日（${dates.length}件）:\n${formatDatesForDisplay(dates)}`
            : "監視日: 全日程";

        // Format last check time
        let lastCheckInfo = "最終チェック: なし";
        if (state?.checkedAt) {
          const lastCheck = new Date(state.checkedAt);
          const hours = String(lastCheck.getHours()).padStart(2, "0");
          const minutes = String(lastCheck.getMinutes()).padStart(2, "0");
          lastCheckInfo = `最終チェック: ${lastCheck.getMonth() + 1}/${lastCheck.getDate()} ${hours}:${minutes}`;
        }

        // Format last notification time
        let lastNotifyInfo = "";
        if (state?.lastNotifiedAt) {
          const lastNotify = new Date(state.lastNotifiedAt);
          const hours = String(lastNotify.getHours()).padStart(2, "0");
          const minutes = String(lastNotify.getMinutes()).padStart(2, "0");
          lastNotifyInfo = `\n最終通知: ${lastNotify.getMonth() + 1}/${lastNotify.getDate()} ${hours}:${minutes}`;
        }

        // Current availability status
        const availabilityInfo = state?.has ? "現在の空き: あり" : "現在の空き: なし";

        // Monitoring interval
        const interval = config?.intervalMinutes ?? 2;

        await replyMessage(
          accessToken,
          replyToken,
          `【現在の設定】\n\n` +
            `状態: ${statusText}\n` +
            `監視間隔: ${interval}分ごと\n\n` +
            `${dateInfo}\n\n` +
            `${availabilityInfo}\n` +
            `${lastCheckInfo}${lastNotifyInfo}`
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
            "「登録」: 通知を受け取る登録\n\n" +
            "■ 監視の開始・停止\n" +
            "「開始」: 監視を開始\n" +
            "「停止」: 監視を停止\n\n" +
            "■ 監視日の管理（複数可）\n" +
            "「1/15」: 1月15日を追加\n" +
            "「1/2 1/3 1/4」: 複数日を一括追加\n" +
            "「削除 1/15」: 1月15日を削除\n" +
            "「全削除」: 全日付を削除\n\n" +
            "■ 監視間隔\n" +
            "「5分」: 5分間隔に変更（1〜60分）\n\n" +
            "■ 状態確認\n" +
            "「状態」: 現在の設定を表示"
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
