/**
 * Builders for the bot's LINE messages.
 *
 * Everything here is pure so the exact payloads can be unit-tested without
 * touching the Messaging API.
 */

import type {
  FlexBox,
  FlexBubble,
  FlexComponent,
  LineAction,
  LineFlexMessage,
  LineQuickReply,
  LineTextMessage,
} from "../types/index.js";
import type { Slot } from "./availability.js";
import { getTargetUrl } from "./availability.js";
import { addDays, formatLongJa, formatShortJa, todayJST } from "./datetime.js";
import { dateOfSlotKey } from "./watch.js";

const COLOR_ACCENT = "#D9480F";
const COLOR_ON = "#2F9E44";
const COLOR_OFF = "#868E96";
const COLOR_MUTED = "#868E96";
const COLOR_TEXT = "#212529";

/** How far ahead the date picker allows selecting. */
const PICKER_HORIZON_DAYS = 180;

/** Slot rows shown per bubble before collapsing into "ほかN件". */
const MAX_SLOT_ROWS = 6;

/** Date rows shown in the status bubble before collapsing. */
const MAX_DATE_ROWS = 10;

/** LINE renders at most 12 bubbles in a carousel. */
const MAX_BUBBLES = 12;

/* ------------------------------------------------------------------ *
 * Postback data
 * ------------------------------------------------------------------ */

export type PostbackAction =
  | { action: "start" }
  | { action: "stop" }
  | { action: "status" }
  | { action: "help" }
  | { action: "clear" }
  | { action: "add" }
  | { action: "delmenu" }
  | { action: "del"; date: string }
  | { action: "interval"; min: number }
  | { action: "night"; on: boolean };

/** Serialises a postback payload into the `data` string LINE echoes back. */
export function encodePostback(payload: PostbackAction): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    params.set(key, String(value));
  }
  return params.toString();
}

/** Parses a postback `data` string. Returns null when unrecognised. */
export function decodePostback(data: string): PostbackAction | null {
  const params = new URLSearchParams(data);
  const action = params.get("action");

  switch (action) {
    case "start":
    case "stop":
    case "status":
    case "help":
    case "clear":
    case "add":
    case "delmenu":
      return { action };
    case "del": {
      const date = params.get("date");
      return date ? { action: "del", date } : null;
    }
    case "interval": {
      const min = parseInt(params.get("min") ?? "", 10);
      return Number.isFinite(min) ? { action: "interval", min } : null;
    }
    case "night": {
      const on = params.get("on");
      return on === null ? null : { action: "night", on: on === "true" };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** Calendar picker for adding a monitored date. */
export function datePickerAction(
  label = "日付を追加",
  today: string = todayJST()
): LineAction {
  return {
    type: "datetimepicker",
    label,
    data: encodePostback({ action: "add" }),
    mode: "date",
    initial: today,
    min: today,
    max: addDays(today, PICKER_HORIZON_DAYS),
  };
}

function postbackAction(
  label: string,
  payload: PostbackAction,
  displayText?: string
): LineAction {
  return {
    type: "postback",
    label,
    data: encodePostback(payload),
    ...(displayText ? { displayText } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Quick replies
 * ------------------------------------------------------------------ */

/**
 * The tap-only control strip attached to every reply.
 *
 * @param enabled - Current monitoring state, so the strip leads with the
 *   action the user is most likely to want next
 */
export function mainQuickReply(
  enabled: boolean,
  today: string = todayJST()
): LineQuickReply {
  const toggle = enabled
    ? postbackAction("⏸ 停止", { action: "stop" }, "停止")
    : postbackAction("▶️ 開始", { action: "start" }, "開始");

  return {
    items: [
      { type: "action", action: { ...datePickerAction("📅 日付を追加", today) } },
      { type: "action", action: toggle },
      { type: "action", action: postbackAction("📋 状態", { action: "status" }, "状態") },
      { type: "action", action: postbackAction("⏱ 2分", { action: "interval", min: 2 }, "2分") },
      { type: "action", action: postbackAction("⏱ 5分", { action: "interval", min: 5 }, "5分") },
      { type: "action", action: postbackAction("⏱ 15分", { action: "interval", min: 15 }, "15分") },
      { type: "action", action: postbackAction("❓ 使い方", { action: "help" }, "使い方") },
    ],
  };
}

/** A plain text reply carrying the standard quick reply strip. */
export function textReply(
  text: string,
  enabled: boolean,
  today: string = todayJST()
): LineTextMessage {
  return { type: "text", text, quickReply: mainQuickReply(enabled, today) };
}

/* ------------------------------------------------------------------ *
 * Shared flex pieces
 * ------------------------------------------------------------------ */

function header(title: string, subtitle: string, color: string): FlexBox {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "16px",
    backgroundColor: color,
    contents: [
      { type: "text", text: subtitle, size: "xs", color: "#FFFFFFCC" },
      {
        type: "text",
        text: title,
        size: "xl",
        weight: "bold",
        color: "#FFFFFF",
        wrap: true,
        margin: "xs",
      },
    ],
  };
}

function labelledRow(label: string, value: string, valueColor = COLOR_TEXT): FlexBox {
  return {
    type: "box",
    layout: "baseline",
    contents: [
      { type: "text", text: label, size: "sm", color: COLOR_MUTED, flex: 2 },
      {
        type: "text",
        text: value,
        size: "sm",
        color: valueColor,
        weight: "bold",
        flex: 4,
        wrap: true,
      },
    ],
  };
}

/** "12:00　●　残り5人" */
function slotRow(slot: Slot): FlexBox {
  const contents: FlexComponent[] = [
    { type: "text", text: slot.time, size: "sm", weight: "bold", flex: 3 },
    {
      type: "text",
      text: slot.marker,
      size: "sm",
      color: slot.marker === "●" ? COLOR_ON : COLOR_ACCENT,
      flex: 1,
    },
  ];

  contents.push({
    type: "text",
    text: slot.seats ? `残り${slot.seats}` : "空きあり",
    size: "sm",
    color: COLOR_MUTED,
    align: "end",
    flex: 4,
  });

  return { type: "box", layout: "baseline", contents };
}

/* ------------------------------------------------------------------ *
 * Availability notification
 * ------------------------------------------------------------------ */

/** One day's worth of availability, as handed to the notification builder. */
export interface AvailabilityHit {
  date: string;
  slots: Slot[];
}

function availabilityBubble(hit: AvailabilityHit): FlexBubble {
  const shown = hit.slots.slice(0, MAX_SLOT_ROWS);
  const rows: FlexComponent[] = shown.map(slotRow);

  if (hit.slots.length > shown.length) {
    rows.push({
      type: "text",
      text: `ほか ${hit.slots.length - shown.length} 枠`,
      size: "xs",
      color: COLOR_MUTED,
      margin: "sm",
    });
  }

  if (rows.length === 0) {
    rows.push({ type: "text", text: "空きあり", size: "sm", color: COLOR_TEXT });
  }

  return {
    type: "bubble",
    header: header(formatLongJa(hit.date), "空きが出ました", COLOR_ACCENT),
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: rows,
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: COLOR_ACCENT,
          action: {
            type: "uri",
            label: "予約ページを開く",
            uri: getTargetUrl(hit.date),
          },
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: postbackAction("この日の監視をやめる", {
            action: "del",
            date: hit.date,
          }),
        },
      ],
    },
  };
}

/**
 * Builds the push notification sent when availability appears.
 *
 * @param hits - Days that just became available (at least one)
 */
export function availabilityNotification(
  hits: AvailabilityHit[]
): LineFlexMessage {
  const shown = hits.slice(0, MAX_BUBBLES);
  const altText =
    hits.length === 1
      ? `【空き】${formatLongJa(hits[0].date)} に空きが出ました`
      : `【空き】${hits.length}日程に空きが出ました（${shown
          .map((hit) => formatShortJa(hit.date))
          .join(" ")}）`;

  return {
    type: "flex",
    altText,
    contents:
      shown.length === 1
        ? availabilityBubble(shown[0])
        : { type: "carousel", contents: shown.map(availabilityBubble) },
  };
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export interface StatusView {
  enabled: boolean;
  intervalMinutes: number;
  nightPause: boolean;
  targetDates: string[];
  /** Slot keys ("YYYY-MM-DD HH:MM") that are currently open. */
  availableSlots: string[];
  checkedAt?: number;
  lastNotifiedAt?: number;
  /** Pre-formatted JST strings, so this builder stays pure and clock-free. */
  checkedAtText?: string;
  lastNotifiedAtText?: string;
}

/** Times shown next to a monitored date before collapsing into "+N". */
const MAX_TIMES_PER_ROW = 3;

function dateRow(date: string, times: string[]): FlexBox {
  const shown = times.slice(0, MAX_TIMES_PER_ROW).join(" ");
  const extra = times.length - Math.min(times.length, MAX_TIMES_PER_ROW);

  return {
    type: "box",
    layout: "baseline",
    contents: [
      {
        type: "text",
        text: formatShortJa(date),
        size: "sm",
        weight: "bold",
        flex: 3,
      },
      {
        type: "text",
        text:
          times.length === 0
            ? "空きなし"
            : extra > 0
              ? `${shown} +${extra}`
              : shown,
        size: "sm",
        color: times.length > 0 ? COLOR_ACCENT : COLOR_MUTED,
        align: "end",
        flex: 5,
        wrap: true,
      },
    ],
  };
}

/** Builds the 状態 bubble: current settings plus the buttons to change them. */
export function statusMessage(view: StatusView): LineFlexMessage {
  const body: FlexComponent[] = [
    labelledRow(
      "状態",
      view.enabled ? "ON（監視中）" : "OFF（停止中）",
      view.enabled ? COLOR_ON : COLOR_OFF
    ),
    labelledRow("監視間隔", `${view.intervalMinutes}分ごと`),
    labelledRow("夜間停止", view.nightPause ? "0〜6時は停止" : "24時間監視"),
    labelledRow("最終チェック", view.checkedAtText ?? "まだ実行していません"),
  ];

  if (view.lastNotifiedAtText) {
    body.push(labelledRow("最終通知", view.lastNotifiedAtText));
  }

  body.push({ type: "separator", margin: "lg" });

  if (view.targetDates.length === 0) {
    body.push({
      type: "text",
      text: "監視日: 全日程（今週分のみ）",
      size: "sm",
      color: COLOR_MUTED,
      margin: "lg",
      wrap: true,
    });
  } else {
    body.push({
      type: "text",
      text: `監視日（${view.targetDates.length}件）`,
      size: "sm",
      weight: "bold",
      margin: "lg",
    });
    const shown = view.targetDates.slice(0, MAX_DATE_ROWS);
    for (const date of shown) {
      body.push(
        dateRow(
          date,
          view.availableSlots
            .filter((key) => dateOfSlotKey(key) === date)
            .map((key) => key.slice(11))
        )
      );
    }
    if (view.targetDates.length > shown.length) {
      body.push({
        type: "text",
        text: `ほか ${view.targetDates.length - shown.length} 件`,
        size: "xs",
        color: COLOR_MUTED,
      });
    }
  }

  const footer: FlexComponent[] = [
    {
      type: "button",
      style: "primary",
      height: "sm",
      color: view.enabled ? COLOR_OFF : COLOR_ON,
      action: view.enabled
        ? postbackAction("監視を停止", { action: "stop" }, "停止")
        : postbackAction("監視を開始", { action: "start" }, "開始"),
    },
    {
      type: "button",
      style: "secondary",
      height: "sm",
      action: datePickerAction("日付を追加"),
    },
  ];

  if (view.targetDates.length > 0) {
    footer.push({
      type: "button",
      style: "link",
      height: "sm",
      action: postbackAction("日付を削除", { action: "delmenu" }, "削除"),
    });
  }

  footer.push({
    type: "button",
    style: "link",
    height: "sm",
    action: postbackAction(
      view.nightPause ? "24時間監視にする" : "夜間(0〜6時)は停止する",
      { action: "night", on: !view.nightPause }
    ),
  });

  return {
    type: "flex",
    altText: `【状態】${view.enabled ? "監視中" : "停止中"} / ${view.intervalMinutes}分ごと / 監視日${view.targetDates.length}件`,
    contents: {
      type: "bubble",
      header: header(
        view.enabled ? "監視中" : "停止中",
        "サウナ空き監視",
        view.enabled ? COLOR_ON : COLOR_OFF
      ),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: footer,
      },
    },
    quickReply: mainQuickReply(view.enabled),
  };
}

/* ------------------------------------------------------------------ *
 * Date management
 * ------------------------------------------------------------------ */

/**
 * Builds the "which date do you want to remove?" picker: one button per
 * monitored date, plus 全削除.
 */
export function deletePickerMessage(targetDates: string[]): LineFlexMessage {
  const shown = targetDates.slice(0, MAX_DATE_ROWS);
  const buttons: FlexComponent[] = shown.map((date) => ({
    type: "button",
    style: "secondary",
    height: "sm",
    action: postbackAction(
      formatShortJa(date),
      { action: "del", date },
      `削除 ${formatShortJa(date)}`
    ),
  }));

  if (targetDates.length > shown.length) {
    buttons.push({
      type: "text",
      text: `ほか ${targetDates.length - shown.length} 件は「削除 8/23」の形式で送信してください`,
      size: "xs",
      color: COLOR_MUTED,
      wrap: true,
    });
  }

  return {
    type: "flex",
    altText: "削除する日付を選んでください",
    contents: {
      type: "bubble",
      header: header("削除する日付", "タップで削除", COLOR_OFF),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: buttons,
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: postbackAction("すべて削除", { action: "clear" }, "全削除"),
          },
        ],
      },
    },
  };
}

/**
 * Builds the push sent when every monitored date has passed and monitoring was
 * switched off automatically. Leads with the date picker so the user can queue
 * a new date in one tap.
 *
 * @param expired - The dates that were dropped
 */
export function monitoringStoppedMessage(expired: string[]): LineFlexMessage {
  const shown = expired.slice(0, MAX_DATE_ROWS);
  const body: FlexComponent[] = [
    {
      type: "text",
      text: "監視していた日付がすべて過去になったため、監視を停止しました。",
      size: "sm",
      color: COLOR_TEXT,
      wrap: true,
    },
  ];

  if (shown.length > 0) {
    body.push({
      type: "text",
      text: "終了した監視日",
      size: "sm",
      weight: "bold",
      margin: "lg",
    });
    for (const date of shown) {
      body.push({
        type: "text",
        text: formatLongJa(date),
        size: "sm",
        color: COLOR_MUTED,
      });
    }
    if (expired.length > shown.length) {
      body.push({
        type: "text",
        text: `ほか ${expired.length - shown.length} 件`,
        size: "xs",
        color: COLOR_MUTED,
      });
    }
  }

  return {
    type: "flex",
    altText: "【停止】監視日がすべて過去日になったため監視を停止しました",
    contents: {
      type: "bubble",
      header: header("監視を停止しました", "サウナ空き監視", COLOR_OFF),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "16px",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: COLOR_ON,
            action: datePickerAction("日付を追加"),
          },
          {
            type: "button",
            style: "link",
            height: "sm",
            action: postbackAction("状態を見る", { action: "status" }, "状態"),
          },
        ],
      },
    },
    quickReply: mainQuickReply(false),
  };
}

/* ------------------------------------------------------------------ *
 * Onboarding
 * ------------------------------------------------------------------ */

/** "① 行きたい日を選ぶ" — a numbered step with its explanation underneath. */
function stepRow(number: string, title: string, detail: string): FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        width: "28px",
        contents: [
          {
            type: "text",
            text: number,
            size: "lg",
            weight: "bold",
            color: COLOR_ACCENT,
            align: "center",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: title, size: "sm", weight: "bold", wrap: true },
          {
            type: "text",
            text: detail,
            size: "xs",
            color: COLOR_MUTED,
            wrap: true,
          },
        ],
      },
    ],
  };
}

const STEPS: Array<[string, string, string]> = [
  ["1", "行きたい日を選ぶ", "「日付を追加」でカレンダーから選びます。何日でも登録できます。"],
  ["2", "「監視開始」を押す", "予約ページを定期的に見に行きはじめます。"],
  ["3", "通知を待つ", "空きが出たら、時間帯と残席つきでお知らせします。"],
];

/**
 * Builds the first message a new user sees. Everything they need to get going
 * is on this one card, in order, with the first action as a button.
 *
 * @param enabled - Current monitoring state. `登録` is also the documented way
 *   to take over the notification target, so this card can be shown while
 *   monitoring is already running.
 */
export function welcomeMessage(
  enabled: boolean,
  today: string = todayJST()
): LineFlexMessage {
  return {
    type: "flex",
    altText: "【はじめかた】日付を選んで「監視開始」を押すと、空きが出たときにお知らせします",
    contents: {
      type: "bubble",
      header: header("はじめかた", "サウナ空き監視", COLOR_ACCENT),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "予約ページに空きが出たらLINEでお知らせします。3ステップで始められます。",
            size: "sm",
            color: COLOR_TEXT,
            wrap: true,
          },
          ...STEPS.map(([number, title, detail]) =>
            stepRow(number, title, detail)
          ),
          { type: "separator" },
          {
            type: "text",
            text: "操作はすべてボタンでできます。画面下の「メニュー」からいつでも開けます。",
            size: "xs",
            color: COLOR_MUTED,
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: COLOR_ACCENT,
            action: datePickerAction("まず日付を選ぶ", today),
          },
          {
            type: "button",
            style: "link",
            height: "sm",
            action: postbackAction("くわしい使い方", { action: "help" }, "使い方"),
          },
        ],
      },
    },
    quickReply: mainQuickReply(enabled, today),
  };
}

/* ------------------------------------------------------------------ *
 * Help
 * ------------------------------------------------------------------ */

function helpSection(title: string, lines: string[]): FlexComponent[] {
  return [
    { type: "text", text: title, size: "sm", weight: "bold", margin: "lg" },
    ...lines.map<FlexComponent>((line) => ({
      type: "text",
      text: line,
      size: "sm",
      color: COLOR_MUTED,
      wrap: true,
    })),
  ];
}

/**
 * Builds the 使い方 bubble: the three steps first, then the full command list
 * for people who would rather type.
 */
export function helpMessage(enabled: boolean): LineFlexMessage {
  const body: FlexComponent[] = [
    {
      type: "text",
      text: "画面下の「メニュー」と、メッセージの下に出るボタンから、すべて操作できます。",
      size: "sm",
      color: COLOR_TEXT,
      wrap: true,
    },
    { type: "text", text: "使いはじめ", size: "sm", weight: "bold", margin: "lg" },
    ...STEPS.map(([number, title, detail]) => stepRow(number, title, detail)),
    { type: "separator", margin: "lg" },
    {
      type: "text",
      text: "キーワードを送っても同じ操作ができます。",
      size: "xs",
      color: COLOR_MUTED,
      wrap: true,
      margin: "lg",
    },
    ...helpSection("監視の開始・停止", ["「開始」/「停止」"]),
    ...helpSection("監視日", [
      "「1/15」「1/2 1/3 1/4」で直接入力",
      "「削除」で一覧から選んで削除",
      "「全削除」で日付指定をやめる",
    ]),
    ...helpSection("監視間隔", ["「5分」（1〜60分）"]),
    ...helpSection("その他", [
      "「状態」で現在の設定を表示",
      "「夜間停止」/「24時間監視」で夜間の扱いを切替",
    ]),
  ];

  return {
    type: "flex",
    altText: "【使い方】ボタンまたはキーワードで操作できます",
    contents: {
      type: "bubble",
      header: header("使い方", "サウナ空き監視", COLOR_ACCENT),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "16px",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "予約ページを開く",
              uri: getTargetUrl(),
            },
          },
        ],
      },
    },
    quickReply: mainQuickReply(enabled),
  };
}
