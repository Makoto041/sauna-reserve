#!/usr/bin/env node
/**
 * Checks every outgoing message against LINE's validation endpoint.
 *
 * Flex payloads are only truly validated by LINE's server, and a rejected one
 * surfaces to the user as 「エラーが発生しました」 — or, for a push, as silence.
 * This sends nothing: /message/validate/push checks the payload and returns.
 *
 * Usage:
 *   npm --prefix functions run build
 *   LINE_CHANNEL_ACCESS_TOKEN="$(firebase functions:secrets:access LINE_CHANNEL_ACCESS_TOKEN)" \
 *     node scripts/validate-messages.mjs
 */

import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VALIDATE_URL = "https://api.line.me/v2/bot/message/validate/push";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error(
    "LINE_CHANNEL_ACCESS_TOKEN is not set.\n" +
      'Try: LINE_CHANNEL_ACCESS_TOKEN="$(firebase functions:secrets:access LINE_CHANNEL_ACCESS_TOKEN)" \\\n' +
      "       node scripts/validate-messages.mjs"
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const buildPath = resolve(here, "../functions/lib/lib/messages.js");

let messages;
try {
  messages = await import(pathToFileURL(buildPath).href);
} catch {
  console.error(
    `Cannot load ${buildPath}. Run: npm --prefix functions run build`
  );
  process.exit(1);
}

const slot = (time, marker, seats) => ({ time, marker, seats });

const status = {
  enabled: true,
  intervalMinutes: 5,
  nightPause: true,
  targetDates: ["2026-08-24", "2026-08-25"],
  availableDates: ["2026-08-24"],
  checkedAtText: "8/23 11:00",
  lastNotifiedAtText: "8/23 10:15",
};

/**
 * One entry per builder, plus the branches that change the payload shape
 * (empty lists, carousel vs single bubble, on/off state).
 */
const CASES = {
  "welcome (stopped)": messages.welcomeMessage(false),
  "welcome (running)": messages.welcomeMessage(true),
  help: messages.helpMessage(false),
  status: messages.statusMessage(status),
  "status (all dates)": messages.statusMessage({
    ...status,
    targetDates: [],
    enabled: false,
  }),
  "status (never checked)": messages.statusMessage({
    ...status,
    checkedAtText: undefined,
    lastNotifiedAtText: undefined,
  }),
  "delete picker": messages.deletePickerMessage([
    "2026-08-24",
    "2026-08-25",
  ]),
  "monitoring stopped": messages.monitoringStoppedMessage(["2026-08-22"]),
  "monitoring stopped (no dates)": messages.monitoringStoppedMessage([]),
  "availability (one day)": messages.availabilityNotification([
    {
      date: "2026-08-24",
      slots: [slot("12:00", "●", "5人"), slot("17:00", "▲", "1人")],
    },
  ]),
  "availability (carousel)": messages.availabilityNotification([
    { date: "2026-08-24", slots: [slot("12:00", "●", "5人")] },
    { date: "2026-08-25", slots: [slot("13:00", "▲", "2人")] },
  ]),
  "text reply": messages.textReply("テスト", true),
};

let failures = 0;

for (const [name, message] of Object.entries(CASES)) {
  const response = await fetch(VALIDATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: [message] }),
  });

  if (response.ok) {
    console.log(`ok    ${name}`);
    continue;
  }

  failures++;
  console.log(`FAIL  ${name}  ${response.status}  ${await response.text()}`);
}

console.log(
  failures === 0
    ? `\nAll ${Object.keys(CASES).length} payloads accepted by LINE.`
    : `\n${failures} payload(s) rejected.`
);
process.exit(failures === 0 ? 0 : 1);
