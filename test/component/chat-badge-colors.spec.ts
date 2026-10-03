import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isUrgentChatType,
  splitTabBadge,
  totalBadgeCounts,
} from "../../utilities/chatBadgeCounts";

describe("splitTabBadge", () => {
  it("counts a private-message tab entirely as red", () => {
    expect(splitTabBadge(3, 0, "direct")).toEqual({ calm: 0, urgent: 3 });
  });

  it("counts an announcement tab entirely as red", () => {
    expect(splitTabBadge(2, 0, "announcement")).toEqual({ calm: 0, urgent: 2 });
  });

  it("does not double count mentions inside a private-message tab", () => {
    expect(splitTabBadge(4, 2, "direct")).toEqual({ calm: 0, urgent: 4 });
  });

  it("keeps ordinary chats amber, with only the @-mentions red", () => {
    expect(splitTabBadge(5, 0, "global")).toEqual({ calm: 5, urgent: 0 });
    expect(splitTabBadge(5, 2, "team")).toEqual({ calm: 3, urgent: 2 });
  });

  it("counts each message once and never goes negative", () => {
    const badge = splitTabBadge(1, 3, "global");
    expect(badge).toEqual({ calm: 0, urgent: 1 });
    expect(splitTabBadge(undefined, undefined, "global")).toEqual({ calm: 0, urgent: 0 });
  });

  it("only direct and announcement are urgent types", () => {
    expect(isUrgentChatType("direct")).toBe(true);
    expect(isUrgentChatType("announcement")).toBe(true);
    for (const type of ["global", "team", "organizers", "tournament", "match", "draft"]) {
      expect(isUrgentChatType(type)).toBe(false);
    }
    expect(isUrgentChatType(undefined)).toBe(false);
  });
});

describe("totalBadgeCounts", () => {
  const types: Record<string, string> = {
    "direct:1:2": "direct",
    announcement: "announcement",
    global: "global",
    team: "team",
  };
  const typeOf = (id: string) => types[id];

  it("sums red and amber across tabs, each message once", () => {
    const total = totalBadgeCounts(
      { "direct:1:2": 2, announcement: 1, global: 4, team: 3 },
      { global: 1, team: 2, "direct:1:2": 1 },
      typeOf,
    );
    // red: 2 (DM) + 1 (announcement) + 1 + 2 (mentions) = 6; amber: 3 + 1 = 4
    expect(total).toEqual({ calm: 4, urgent: 6 });
    expect(total.calm + total.urgent).toBe(2 + 1 + 4 + 3);
  });

  it("treats an unknown tab as an ordinary chat", () => {
    expect(totalBadgeCounts({ mystery: 2 }, {}, () => undefined)).toEqual({
      calm: 2,
      urgent: 0,
    });
  });
});

describe("sidebar wiring", () => {
  const read = (file: string) =>
    readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("RightHub feeds the amber and red badges from the split totals", () => {
    const hub = read("layouts/components/RightHub.vue");
    expect(hub).toContain("totalBadgeCounts(");
    expect(hub).toContain("const totalUnread = computed(() => chatBadges.value.calm);");
    expect(hub).toContain("const totalMentions = computed(() => chatBadges.value.urgent);");
    // A direct tab registered without a type still counts as private.
    expect(hub).toContain('tabId.startsWith("direct:")');
  });

  it("ChatPanel colours private and announcement tabs red", () => {
    const panel = read("components/hub/ChatPanel.vue");
    expect(panel).toContain("isUrgentChatType(tab.type) && tabBadge(tab).urgent");
    expect(panel).toMatch(/bg-red-500 text-white text-\[9px\][^>]*\n[^>]*urgent_badge/);
  });
});
