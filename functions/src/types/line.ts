/**
 * LINE Messaging API types (subset for our use case)
 */

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: LineSource;
  message?: LineMessage;
  timestamp: number;
}

export interface LineSource {
  type: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineMessage {
  type: string;
  id: string;
  text?: string;
}

export interface LineReplyMessage {
  replyToken: string;
  messages: LineTextMessage[];
}

export interface LinePushMessage {
  to: string;
  messages: LineTextMessage[];
}

export interface LineTextMessage {
  type: "text";
  text: string;
}
