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

import { readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const sourceDir = resolve(here, "../functions/src");
const buildPath = resolve(here, "../functions/lib/lib/messages.js");

/** Most recent mtime under a directory, in epoch ms. */
async function newestMtime(dir) {
  let newest = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? await newestMtime(path)
      : (await stat(path)).mtimeMs;
    newest = Math.max(newest, mtime);
  }
  return newest;
}

let built;
try {
  built = await stat(buildPath);
} catch {
  console.error(
    `${buildPath} does not exist. Run: npm --prefix functions run build`
  );
  process.exit(1);
}

// Validating a stale build is the exact false pass this script exists to
// prevent, so refuse rather than warn.
if ((await newestMtime(sourceDir)) > built.mtimeMs) {
  console.error(
    "functions/src is newer than the build; this would validate the previous\n" +
      "code. Run: npm --prefix functions run build"
  );
  process.exit(1);
}

let messages;
try {
  messages = await import(pathToFileURL(buildPath).href);
} catch (err) {
  console.error(`Cannot load ${buildPath}:`);
  console.error(err);
  process.exit(1);
}

const slot = (time, marker, seats) => ({ time, marker, seats });

const status = {
  enabled: true,
  intervalMinutes: 5,
  nightPause: true,
  targetDates: ["2026-08-24", "2026-08-25"],
  availableSlots: ["2026-08-24 12:00", "2026-08-24 21:00"],
  checkedAtText: "8/23 11:00",
  lastNotifiedAtText: "8/23 10:15",
};

const manyDates = Array.from(
  { length: 14 },
  (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`
);

/**
 * One entry per builder, plus every branch that changes the payload shape:
 * empty lists, carousel vs single bubble, on/off state, and the truncation
 * paths, which add an extra "ほか N 件" component that nothing else exercises.
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
  "delete picker (truncated)": messages.deletePickerMessage(manyDates),
  "status (truncated dates)": messages.statusMessage({
    ...status,
    targetDates: manyDates,
  }),
  "monitoring stopped": messages.monitoringStoppedMessage(["2026-08-22"]),
  "monitoring stopped (no dates)": messages.monitoringStoppedMessage([]),
  "monitoring stopped (truncated)":
    messages.monitoringStoppedMessage(manyDates),
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
  "availability (truncated slots)": messages.availabilityNotification([
    {
      date: "2026-08-24",
      slots: Array.from({ length: 10 }, (_, index) =>
        slot(`${12 + index}:00`, "●", "3人")
      ),
    },
  ]),
  "availability (capped carousel)": messages.availabilityNotification(
    manyDates.map((date) => ({ date, slots: [slot("12:00", "●", "4人")] }))
  ),
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
