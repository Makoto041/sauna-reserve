/**
 * LINE Messaging API utilities
 */

import * as crypto from "crypto";
import type { LineTextMessage } from "../types/index.js";

const LINE_API_BASE = "https://api.line.me/v2/bot";

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
  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

/**
 * Sends a reply message to LINE.
 *
 * @param accessToken - LINE Channel Access Token
 * @param replyToken - Reply token from webhook event
 * @param text - Message text to send
 */
export async function replyMessage(
  accessToken: string,
  replyToken: string,
  text: string
): Promise<void> {
  const messages: LineTextMessage[] = [{ type: "text", text }];

  const response = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE reply failed: ${response.status} - ${errorText}`);
  }
}

/**
 * Sends a push message to LINE user.
 *
 * @param accessToken - LINE Channel Access Token
 * @param userId - Target user ID
 * @param text - Message text to send
 */
export async function pushMessage(
  accessToken: string,
  userId: string,
  text: string
): Promise<void> {
  const messages: LineTextMessage[] = [{ type: "text", text }];

  const response = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE push failed: ${response.status} - ${errorText}`);
  }
}
