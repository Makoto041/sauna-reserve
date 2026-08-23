#!/usr/bin/env node
/**
 * Registers the rich menu with the LINE channel and makes it the default for
 * every user.
 *
 * The rich menu is the permanent panel under the chat input. It is the only
 * part of the bot a first-time user sees without typing, so every action it
 * offers must work with a single tap.
 *
 * Usage:
 *   LINE_CHANNEL_ACCESS_TOKEN=... node scripts/richmenu/setup.mjs [--keep-old]
 *
 * Run it again after changing the image or the tile actions; existing rich
 * menus are removed first unless --keep-old is passed.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";

const IMAGE_PATH = fileURLToPath(new URL("./richmenu.png", import.meta.url));

/** Must match the 3x2 grid drawn by generate-image.py. */
const WIDTH = 2500;
const HEIGHT = 1686;
const COLS = 3;
const ROWS = 2;

/**
 * Tile actions, left to right then top to bottom.
 *
 * The date picker deliberately carries no `min`/`max`: a rich menu is static,
 * so any bound baked in here would go stale. Past dates are rejected by the
 * webhook instead.
 */
const ACTIONS = [
  { type: "datetimepicker", label: "日付を追加", data: "action=add", mode: "date" },
  { type: "postback", label: "監視開始", data: "action=start", displayText: "開始" },
  { type: "postback", label: "監視停止", data: "action=stop", displayText: "停止" },
  { type: "postback", label: "状態", data: "action=status", displayText: "状態" },
  { type: "postback", label: "日付を削除", data: "action=delmenu", displayText: "削除" },
  { type: "postback", label: "使い方", data: "action=help", displayText: "使い方" },
];

function buildAreas() {
  const cellWidth = Math.floor(WIDTH / COLS);
  const cellHeight = Math.floor(HEIGHT / ROWS);

  return ACTIONS.map((action, index) => {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    return {
      bounds: {
        x: col * cellWidth,
        y: row * cellHeight,
        // The rightmost / bottom tile absorbs the rounding remainder so the
        // areas cover the image exactly.
        width: col === COLS - 1 ? WIDTH - col * cellWidth : cellWidth,
        height: row === ROWS - 1 ? HEIGHT - row * cellHeight : cellHeight,
      },
      action,
    };
  });
}

const MENU = {
  size: { width: WIDTH, height: HEIGHT },
  selected: true,
  name: "sauna-reserve main",
  chatBarText: "メニュー",
  areas: buildAreas(),
};

async function call(base, path, { method = "POST", body, contentType } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error(
    "LINE_CHANNEL_ACCESS_TOKEN is not set.\n" +
      'Try: LINE_CHANNEL_ACCESS_TOKEN="$(firebase functions:secrets:access LINE_CHANNEL_ACCESS_TOKEN)" \\\n' +
      "       node scripts/richmenu/setup.mjs"
  );
  process.exit(1);
}

const keepOld = process.argv.includes("--keep-old");

if (!keepOld) {
  const { richmenus = [] } = await call(API, "/richmenu/list", {
    method: "GET",
  });
  for (const menu of richmenus) {
    await call(API, `/richmenu/${menu.richMenuId}`, { method: "DELETE" });
    console.log(`deleted old rich menu ${menu.richMenuId} (${menu.name})`);
  }
}

const { richMenuId } = await call(API, "/richmenu", {
  body: JSON.stringify(MENU),
  contentType: "application/json",
});
console.log(`created rich menu ${richMenuId}`);

await call(DATA_API, `/richmenu/${richMenuId}/content`, {
  body: await readFile(IMAGE_PATH),
  contentType: "image/png",
});
console.log("uploaded image");

await call(API, `/user/all/richmenu/${richMenuId}`);
console.log("set as the default rich menu for all users");
