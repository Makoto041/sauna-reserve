/**
 * LINE Messaging API utilities
 */

import * as crypto from "crypto";
import type { LineMessage } from "../types/index.js";

const LINE_API_BASE = "https://api.line.me/v2/bot";
const REQUEST_TIMEOUT_MS = 10_000;

/** Accepts plain text for simple replies, or fully built message objects. */
export type MessageInput = string | LineMessage | LineMessage[];

function toMessages(input: MessageInput): LineMessage[] {
  if (typeof input === "string") {
    return [{ type: "text", text: input }];
  }
  return Array.isArray(input) ? input : [input];
}

/**
 * Verifies LINE webhook signature.
 *
 * @param channelSecret - LINE Channel Secret
 * @param signature - X-Line-Signature header value
 * @param body - Raw request body string
 * @returns true if signature is valid
 */
export function verifySignature(
  channelSecret: string,
  signature: string,
  body: string
): boolean {
  // defineSecret().value() resolves to "" when the secret failed to load.
  // HMACing with an empty key would accept any request an attacker can sign
  // with that same empty key, so fail closed instead.
  if (!channelSecret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  if (received.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, received);
}

async function callLineApi(
  accessToken: string,
  path: string,
  payload: unknown,
  label: string
): Promise<void> {
  const response = await fetch(`${LINE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE ${label} failed: ${response.status} - ${errorText}`);
  }
}

/**
 * Sends a reply to LINE.
 *
 * @param accessToken - LINE Channel Access Token
 * @param replyToken - Reply token from webhook event
 * @param message - Text, or one or more message objects
 */
export async function replyMessage(
  accessToken: string,
  replyToken: string,
  message: MessageInput
): Promise<void> {
  await callLineApi(
    accessToken,
    "/message/reply",
    { replyToken, messages: toMessages(message) },
    "reply"
  );
}

/**
 * Sends a push message to a LINE user.
 *
 * @param accessToken - LINE Channel Access Token
 * @param userId - Target user ID
 * @param message - Text, or one or more message objects
 */
export async function pushMessage(
  accessToken: string,
  userId: string,
  message: MessageInput
): Promise<void> {
  await callLineApi(
    accessToken,
    "/message/push",
    { to: userId, messages: toMessages(message) },
    "push"
  );
}
