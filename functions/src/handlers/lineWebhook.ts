/**
 * LINE Webhook Handler
 *
 * Every action is available both as a tappable button (postback / date picker
 * / quick reply) and as a typed keyword, so the bot works the same whether the
 * user taps or types.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import type {
  LineWebhookBody,
  LineEvent,
  LineMessage,
} from "../types/index.js";
import {
  verifySignature,
  replyMessage,
  setLineTarget,
  getLineTarget,
  setWatchEnabled,
  setIntervalMinutes,
  setNightPause,
  addTargetDates,
  removeTargetDate,
  clearTargetDates,
  getWatchConfig,
  getWatchState,
  ensureWatchConfig,
  DEFAULT_INTERVAL_MINUTES,
  decodePostback,
  statusMessage,
  helpMessage,
  welcomeMessage,
  deletePickerMessage,
  textReply,
  formatLongJa,
  formatTimestampJST,
  todayJST,
  resolveCommand,
  splitPastDates,
  MUTATING_COMMANDS,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  type Command,
} from "../lib/index.js";

/* ------------------------------------------------------------------ *
 * Command execution
 * ------------------------------------------------------------------ */

async function buildStatusMessage(): Promise<LineMessage> {
  const [config, state] = await Promise.all([getWatchConfig(), getWatchState()]);
  return statusMessage({
    enabled: config?.enabled ?? false,
    intervalMinutes: config?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
    nightPause: config?.nightPause ?? true,
    targetDates: [...(config?.targetDates ?? [])].sort(),
    availableDates: state?.availableDates ?? [],
    checkedAtText: state?.checkedAt
      ? formatTimestampJST(state.checkedAt)
      : undefined,
    lastNotifiedAtText: state?.lastNotifiedAt
      ? formatTimestampJST(state.lastNotifiedAt)
      : undefined,
  });
}

/** Runs a command and returns the messages to reply with. */
async function execute(
  command: Command,
  userId: string,
  today: string
): Promise<LineMessage[]> {
  if (MUTATING_COMMANDS.has(command.kind)) {
    const owner = await getLineTarget();
    if (owner?.userId && owner.userId !== userId) {
      logger.info("Refused a config change from a non-owner", {
        userId,
        kind: command.kind,
      });
      const config = await getWatchConfig();
      return [
        textReply(
          "この監視は別のユーザーが設定しています。\n\n" +
            "自分の通知として使う場合は「登録」と送ってください。\n" +
            "（通知先が自分に切り替わり、設定を変更できるようになります）",
          config?.enabled ?? false,
          today
        ),
      ];
    }
  }

  switch (command.kind) {
    case "follow": {
      // Auto-registering on follow is convenient, but line/target holds a
      // single recipient: without this guard anyone who finds the account
      // would silently take over the previous user's notifications.
      const existing = await getLineTarget();
      if (existing?.userId && existing.userId !== userId) {
        const config = await getWatchConfig();
        logger.info("Follow ignored, another user is registered", { userId });
        return [
          textReply(
            "友だち追加ありがとうございます。\n\n" +
              "このボットは既に別のユーザーが通知先として登録されています。\n" +
              "自分に切り替える場合は「登録」と送ってください。",
            config?.enabled ?? false,
            today
          ),
        ];
      }
      return execute({ kind: "register" }, userId, today);
    }

    case "register": {
      await setLineTarget(userId);
      const config = await ensureWatchConfig();
      logger.info("User registered", { userId });
      return [welcomeMessage(config.enabled, today)];
    }

    case "start": {
      await ensureWatchConfig();
      await setWatchEnabled(true);
      logger.info("Monitoring enabled", { userId });
      return [await buildStatusMessage()];
    }

    case "stop": {
      await ensureWatchConfig();
      await setWatchEnabled(false);
      logger.info("Monitoring disabled", { userId });
      return [await buildStatusMessage()];
    }

    case "status":
      return [await buildStatusMessage()];

    case "help": {
      const config = await getWatchConfig();
      return [helpMessage(config?.enabled ?? false)];
    }

    case "add": {
      // Explicit years ("2020/1/1") and stale date pickers can both carry a
      // past date, which the next tick would prune - and, if it were the only
      // date, silently stop monitoring.
      const { future: dates, past } = splitPastDates(command.dates, today);
      const config = await getWatchConfig();

      if (dates.length === 0) {
        return [
          textReply(
            `過去の日付は追加できません。\n${past.map(formatLongJa).join("\n")}`,
            config?.enabled ?? false,
            today
          ),
        ];
      }

      const all = await addTargetDates(dates);
      logger.info("Target dates added", { userId, dates, skipped: past });
      const added =
        dates.length === 1
          ? `${formatLongJa(dates[0])} を監視対象に追加しました。`
          : `${dates.length}件を監視対象に追加しました。\n` +
            dates.map(formatLongJa).join("\n");
      const skipped =
        past.length > 0
          ? `\n\n過去の日付は追加していません:\n${past.map(formatLongJa).join("\n")}`
          : "";
      const hint = config?.enabled
        ? ""
        : "\n\n「▶️ 開始」を押すと監視を始めます。";
      return [
        textReply(
          `${added}${skipped}\n\n現在の監視日: ${all.length}件${hint}`,
          config?.enabled ?? false,
          today
        ),
      ];
    }

    case "delmenu": {
      const config = await getWatchConfig();
      const dates = [...(config?.targetDates ?? [])].sort();
      if (dates.length === 0) {
        return [
          textReply(
            "監視中の日付はありません。",
            config?.enabled ?? false,
            today
          ),
        ];
      }
      return [deletePickerMessage(dates)];
    }

    case "del": {
      const removed = await removeTargetDate(command.date);
      const config = await getWatchConfig();
      const remaining = config?.targetDates?.length ?? 0;
      logger.info("Target date removal", {
        userId,
        date: command.date,
        removed,
      });
      const emptied =
        removed && remaining === 0
          ? "\n\n監視日が0件になりました。\nこのままだと今週表示ぶんの全日程が監視対象になります。"
          : "";
      const text = removed
        ? `${formatLongJa(command.date)} を監視対象から削除しました。\n\n残りの監視日: ${remaining}件${emptied}`
        : `${formatLongJa(command.date)} は監視対象に含まれていません。`;
      return [textReply(text, config?.enabled ?? false, today)];
    }

    case "clear": {
      await clearTargetDates();
      const config = await getWatchConfig();
      logger.info("All target dates cleared", { userId });
      return [
        textReply(
          "監視日をすべて削除しました。\n今週表示ぶんの全日程が監視対象になります。",
          config?.enabled ?? false,
          today
        ),
      ];
    }

    case "interval": {
      await ensureWatchConfig();
      await setIntervalMinutes(command.minutes);
      logger.info("Interval updated", { userId, minutes: command.minutes });
      return [await buildStatusMessage()];
    }

    case "intervalOutOfRange": {
      const config = await getWatchConfig();
      return [
        textReply(
          `監視間隔は${MIN_INTERVAL_MINUTES}〜${MAX_INTERVAL_MINUTES}分で指定してください。\n例: 「5分」「間隔 10」`,
          config?.enabled ?? false,
          today
        ),
      ];
    }

    case "night": {
      await ensureWatchConfig();
      await setNightPause(command.on);
      logger.info("Night pause updated", { userId, on: command.on });
      return [await buildStatusMessage()];
    }

    case "badDate": {
      const config = await getWatchConfig();
      return [
        textReply(
          "日付を読み取れませんでした。\n例: 「削除 1/15」「削除 2027/1/15」\n\n「削除」だけ送ると一覧から選べます。",
          config?.enabled ?? false,
          today
        ),
      ];
    }

    case "unknown": {
      // Someone who types something unexpected is usually lost rather than
      // mistyping a command, so answer with the guide instead of an error.
      const config = await getWatchConfig();
      return [
        {
          type: "text",
          text: "うまく読み取れませんでした。使い方を出しますね。",
        },
        helpMessage(config?.enabled ?? false),
      ];
    }
  }
}

/* ------------------------------------------------------------------ *
 * Event handling
 * ------------------------------------------------------------------ */

/** Maps a postback event to a command. */
function commandFromPostback(event: LineEvent): Command {
  const payload = decodePostback(event.postback?.data ?? "");
  if (!payload) {
    return { kind: "unknown" };
  }

  switch (payload.action) {
    case "add": {
      // The date picker returns YYYY-MM-DD, so no year guessing is needed.
      const date = event.postback?.params?.date;
      return date ? { kind: "add", dates: [date] } : { kind: "badDate" };
    }
    case "del":
      return { kind: "del", date: payload.date };
    case "interval":
      return payload.min >= MIN_INTERVAL_MINUTES &&
        payload.min <= MAX_INTERVAL_MINUTES
        ? { kind: "interval", minutes: payload.min }
        : { kind: "intervalOutOfRange" };
    case "night":
      return { kind: "night", on: payload.on };
    case "start":
      return { kind: "start" };
    case "stop":
      return { kind: "stop" };
    case "status":
      return { kind: "status" };
    case "help":
      return { kind: "help" };
    case "clear":
      return { kind: "clear" };
    case "delmenu":
      return { kind: "delmenu" };
  }
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
  const userId = event.source?.userId;
  const replyToken = event.replyToken;
  const today = todayJST();

  if (!userId || !replyToken) {
    logger.info("Ignoring event without userId/replyToken", {
      type: event.type,
    });
    return;
  }

  let command: Command;
  if (event.type === "follow") {
    command = { kind: "follow" };
  } else if (event.type === "postback") {
    command = commandFromPostback(event);
  } else if (event.type === "message" && event.message?.type === "text") {
    command = resolveCommand(event.message.text?.trim() ?? "", today);
  } else {
    logger.info("Ignoring unsupported event", { type: event.type });
    return;
  }

  logger.info("Processing command", { kind: command.kind, userId });

  try {
    const messages = await execute(command, userId, today);
    await replyMessage(accessToken, replyToken, messages);
  } catch (err) {
    logger.error("Error processing event", {
      error: err instanceof Error ? err.message : String(err),
      kind: command.kind,
      userId,
    });
    try {
      await replyMessage(
        accessToken,
        replyToken,
        "エラーが発生しました。しばらく待ってから再試行してください。"
      );
    } catch {
      // The reply token may already be spent; nothing more we can do.
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

    if (!verifySignature(channelSecret, signature, rawBody)) {
      logger.warn("Invalid signature");
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
