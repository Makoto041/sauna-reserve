/**
 * LINE Messaging API types (the subset this bot uses).
 */

/* ------------------------------------------------------------------ *
 * Incoming webhook payloads
 * ------------------------------------------------------------------ */

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: LineSource;
  message?: LineIncomingMessage;
  postback?: LinePostback;
  timestamp: number;
}

export interface LineSource {
  type: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineIncomingMessage {
  type: string;
  id: string;
  text?: string;
}

export interface LinePostback {
  data: string;
  params?: {
    date?: string;
    time?: string;
    datetime?: string;
  };
}

/* ------------------------------------------------------------------ *
 * Actions and quick replies
 * ------------------------------------------------------------------ */

export type LineAction =
  | { type: "message"; label: string; text: string }
  | { type: "postback"; label?: string; data: string; displayText?: string }
  | { type: "uri"; label: string; uri: string }
  | {
      type: "datetimepicker";
      label: string;
      data: string;
      mode: "date";
      initial?: string;
      min?: string;
      max?: string;
    };

export interface LineQuickReplyItem {
  type: "action";
  action: LineAction;
}

/** LINE renders at most 13 quick reply items. */
export interface LineQuickReply {
  items: LineQuickReplyItem[];
}

/* ------------------------------------------------------------------ *
 * Flex message components
 * ------------------------------------------------------------------ */

export interface FlexText {
  type: "text";
  text: string;
  size?: string;
  color?: string;
  weight?: "regular" | "bold";
  align?: "start" | "center" | "end";
  wrap?: boolean;
  flex?: number;
  margin?: string;
}

export interface FlexSeparator {
  type: "separator";
  margin?: string;
  color?: string;
}

export interface FlexButton {
  type: "button";
  action: LineAction;
  style?: "primary" | "secondary" | "link";
  color?: string;
  height?: "sm" | "md";
  margin?: string;
  flex?: number;
}

export interface FlexFiller {
  type: "filler";
}

export interface FlexBox {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: FlexComponent[];
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  paddingTop?: string;
  backgroundColor?: string;
  cornerRadius?: string;
  alignItems?: "flex-start" | "center" | "flex-end";
  justifyContent?: string;
  flex?: number;
  width?: string;
}

export type FlexComponent =
  | FlexBox
  | FlexText
  | FlexSeparator
  | FlexButton
  | FlexFiller;

export interface FlexBubble {
  type: "bubble";
  size?: "nano" | "micro" | "kilo" | "mega" | "giga";
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
}

export interface FlexCarousel {
  type: "carousel";
  /** LINE allows at most 12 bubbles. */
  contents: FlexBubble[];
}

export type FlexContainer = FlexBubble | FlexCarousel;

/* ------------------------------------------------------------------ *
 * Outgoing messages
 * ------------------------------------------------------------------ */

export interface LineTextMessage {
  type: "text";
  text: string;
  quickReply?: LineQuickReply;
}

export interface LineFlexMessage {
  type: "flex";
  /** Required by the API; shown in notifications and unsupported clients. */
  altText: string;
  contents: FlexContainer;
  quickReply?: LineQuickReply;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

export interface LineReplyMessage {
  replyToken: string;
  messages: LineMessage[];
}

export interface LinePushMessage {
  to: string;
  messages: LineMessage[];
}
