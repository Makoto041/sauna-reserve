import { describe, it, expect } from "vitest";
import type {
  FlexComponent,
  FlexContainer,
  LineAction,
  LineFlexMessage,
  LineMessage,
} from "../src/types/line.js";
import type { Slot } from "../src/lib/availability.js";
import {
  availabilityNotification,
  decodePostback,
  deletePickerMessage,
  encodePostback,
  helpMessage,
  mainQuickReply,
  statusMessage,
  textReply,
} from "../src/lib/messages.js";

const TODAY = "2026-08-22";

/** Limits enforced by the Messaging API. */
const MAX_ALT_TEXT = 400;
const MAX_QUICK_REPLY_ITEMS = 13;
const MAX_CAROUSEL_BUBBLES = 12;
const MAX_LABEL_CHARS = 20;

function slot(time: string, marker: "●" | "▲", seats?: string): Slot {
  return { time, marker, ...(seats ? { seats } : {}) };
}

/** Walks a flex container and returns every action it contains. */
function collectActions(container: FlexContainer): LineAction[] {
  const actions: LineAction[] = [];

  const walkComponent = (component: FlexComponent): void => {
    if (component.type === "button") {
      actions.push(component.action);
    } else if (component.type === "box") {
      component.contents.forEach(walkComponent);
    }
  };

  const bubbles =
    container.type === "carousel" ? container.contents : [container];
  for (const bubble of bubbles) {
    for (const box of [bubble.header, bubble.body, bubble.footer]) {
      box?.contents.forEach(walkComponent);
    }
  }

  return actions;
}

function labelOf(action: LineAction): string {
  return "label" in action && action.label ? action.label : "";
}

/** Asserts the API-level constraints every outgoing message must satisfy. */
function expectValidMessage(message: LineMessage): void {
  const actions: LineAction[] = [];

  if (message.type === "flex") {
    expect(message.altText.length).toBeGreaterThan(0);
    expect(message.altText.length).toBeLessThanOrEqual(MAX_ALT_TEXT);
    if (message.contents.type === "carousel") {
      expect(message.contents.contents.length).toBeGreaterThan(0);
      expect(message.contents.contents.length).toBeLessThanOrEqual(
        MAX_CAROUSEL_BUBBLES
      );
    }
    actions.push(...collectActions(message.contents));
  }

  const quickReplyItems = message.quickReply?.items ?? [];
  expect(quickReplyItems.length).toBeLessThanOrEqual(MAX_QUICK_REPLY_ITEMS);
  actions.push(...quickReplyItems.map((item) => item.action));

  for (const action of actions) {
    expect(labelOf(action).length).toBeLessThanOrEqual(MAX_LABEL_CHARS);
    if (action.type === "postback") {
      expect(decodePostback(action.data)).not.toBeNull();
    }
    if (action.type === "datetimepicker") {
      expect(action.mode).toBe("date");
      expect(action.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(action.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(decodePostback(action.data)).toEqual({ action: "add" });
    }
    if (action.type === "uri") {
      expect(action.uri).toMatch(/^https:\/\//);
    }
  }
}

describe("postback encoding", () => {
  it("round-trips every action shape", () => {
    const payloads = [
      { action: "start" },
      { action: "stop" },
      { action: "status" },
      { action: "help" },
      { action: "clear" },
      { action: "add" },
      { action: "delmenu" },
      { action: "del", date: "2026-09-01" },
      { action: "interval", min: 5 },
      { action: "night", on: true },
      { action: "night", on: false },
    ] as const;

    for (const payload of payloads) {
      expect(decodePostback(encodePostback(payload))).toEqual(payload);
    }
  });

  it("rejects unknown or malformed data", () => {
    expect(decodePostback("")).toBeNull();
    expect(decodePostback("action=explode")).toBeNull();
    expect(decodePostback("action=del")).toBeNull();
    expect(decodePostback("action=interval&min=abc")).toBeNull();
  });
});

describe("mainQuickReply", () => {
  it("offers stop while monitoring and start while stopped", () => {
    const running = mainQuickReply(true, TODAY).items.map((item) =>
      labelOf(item.action)
    );
    expect(running).toContain("⏸ 停止");
    expect(running).not.toContain("▶️ 開始");

    const stopped = mainQuickReply(false, TODAY).items.map((item) =>
      labelOf(item.action)
    );
    expect(stopped).toContain("▶️ 開始");
  });

  it("cannot select a past date in the picker", () => {
    const picker = mainQuickReply(false, TODAY).items[0].action;
    expect(picker).toMatchObject({ type: "datetimepicker", min: TODAY });
  });

  it("stays within the API limits", () => {
    expectValidMessage(textReply("hello", true, TODAY));
  });
});

describe("availabilityNotification", () => {
  it("uses a single bubble for one date and names it in altText", () => {
    const message = availabilityNotification([
      { date: "2026-08-23", slots: [slot("21:00", "●", "5人")] },
    ]);
    expect(message.contents.type).toBe("bubble");
    expect(message.altText).toContain("2026年8月23日(日)");
    expectValidMessage(message);
  });

  it("uses a carousel for several dates", () => {
    const message = availabilityNotification([
      { date: "2026-08-23", slots: [slot("21:00", "●")] },
      { date: "2026-08-24", slots: [slot("12:00", "●", "5人")] },
    ]);
    expect(message.contents.type).toBe("carousel");
    expect(message.altText).toContain("2日程");
    expectValidMessage(message);
  });

  it("caps the carousel at the API maximum", () => {
    const hits = Array.from({ length: 20 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      slots: [slot("12:00", "●")],
    }));
    const message = availabilityNotification(hits);
    expectValidMessage(message);
  });

  it("collapses long slot lists", () => {
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot(`${12 + index}:00`, "●", "3人")
    );
    const message = availabilityNotification([
      { date: "2026-08-25", slots },
    ]);
    expect(JSON.stringify(message)).toContain("ほか 4 枠");
    expectValidMessage(message);
  });

  it("links straight to the week containing the date", () => {
    const message = availabilityNotification([
      { date: "2026-09-10", slots: [slot("12:00", "●")] },
    ]);
    expect(JSON.stringify(message)).toContain("date=20260910");
  });

  it("offers a one-tap unwatch for the date", () => {
    const message = availabilityNotification([
      { date: "2026-09-10", slots: [slot("12:00", "●")] },
    ]);
    const actions = collectActions(message.contents);
    expect(
      actions.some(
        (action) =>
          action.type === "postback" &&
          decodePostback(action.data)?.action === "del"
      )
    ).toBe(true);
  });
});

describe("statusMessage", () => {
  const base = {
    enabled: true,
    intervalMinutes: 5,
    nightPause: true,
    targetDates: ["2026-08-23", "2026-08-24"],
    availableDates: ["2026-08-23"],
    checkedAtText: "8/22 18:30",
    lastNotifiedAtText: "8/22 10:15",
  };

  it("summarises the settings in altText", () => {
    const message = statusMessage(base);
    expect(message.altText).toBe(
      "【状態】監視中 / 5分ごと / 監視日2件"
    );
    expectValidMessage(message);
  });

  it("shows which monitored dates currently have availability", () => {
    const rendered = JSON.stringify(statusMessage(base));
    expect(rendered).toContain("8/23(日)");
    expect(rendered).toContain("空きあり");
    expect(rendered).toContain("空きなし");
  });

  it("offers start when stopped and stop when running", () => {
    expect(JSON.stringify(statusMessage(base))).toContain("監視を停止");
    expect(
      JSON.stringify(statusMessage({ ...base, enabled: false }))
    ).toContain("監視を開始");
  });

  it("offers the opposite night-pause setting", () => {
    expect(JSON.stringify(statusMessage(base))).toContain("24時間監視にする");
    expect(
      JSON.stringify(statusMessage({ ...base, nightPause: false }))
    ).toContain("夜間(0〜6時)は停止する");
  });

  it("explains the all-dates mode when no dates are set", () => {
    const message = statusMessage({ ...base, targetDates: [] });
    expect(JSON.stringify(message)).toContain("全日程");
    expectValidMessage(message);
  });

  it("collapses very long date lists", () => {
    const targetDates = Array.from(
      { length: 15 },
      (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`
    );
    const message = statusMessage({ ...base, targetDates });
    expect(JSON.stringify(message)).toContain("ほか 5 件");
    expectValidMessage(message);
  });

  it("copes with a state that has never been checked", () => {
    const message = statusMessage({
      ...base,
      checkedAtText: undefined,
      lastNotifiedAtText: undefined,
    });
    expect(JSON.stringify(message)).toContain("まだ実行していません");
    expectValidMessage(message);
  });
});

describe("deletePickerMessage", () => {
  it("renders one delete button per date plus 全削除", () => {
    const message = deletePickerMessage(["2026-08-23", "2026-08-24"]);
    const actions = collectActions(message.contents);
    const deleted = actions
      .filter((action) => action.type === "postback")
      .map((action) => decodePostback((action as { data: string }).data));
    expect(deleted).toContainEqual({ action: "del", date: "2026-08-23" });
    expect(deleted).toContainEqual({ action: "del", date: "2026-08-24" });
    expect(deleted).toContainEqual({ action: "clear" });
    expectValidMessage(message);
  });

  it("explains the fallback when there are too many dates", () => {
    const dates = Array.from(
      { length: 14 },
      (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`
    );
    expect(JSON.stringify(deletePickerMessage(dates))).toContain("ほか 4 件");
  });
});

describe("helpMessage", () => {
  it("is a valid flex message with the control strip attached", () => {
    const message: LineFlexMessage = helpMessage(false);
    expect(message.quickReply?.items.length).toBeGreaterThan(0);
    expectValidMessage(message);
  });
});
