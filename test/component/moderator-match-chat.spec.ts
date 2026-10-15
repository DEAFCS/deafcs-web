import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { matchChatHubContext } from "../../composables/useChatHubContext";

// Moderators may read a running match's shared Match Chat (Anders
// 2026-10-15). The API decides (chat-moderator-match-chat.spec.ts there):
// read only, never a Team Chat. The web offers exactly that room, read-only,
// without popping the Hub open.

const t = (key: string) => key;
const MY_LINEUP = { id: "l1", name: "Team Alpha", is_on_lineup: true };
const match = {
  id: "m1",
  label: null,
  lineup_1: MY_LINEUP,
  lineup_2: { id: "l2", name: "Team Bravo", is_on_lineup: false },
};

describe("matchChatHubContext for staff", () => {
  it("gives a moderator who is not in the match the shared Match Chat only, read-only, without opening the Hub", () => {
    const context = matchChatHubContext(match, false, null, t, true);
    expect(context?.rooms).toEqual([
      expect.objectContaining({ type: "match", lobbyId: "m1", readOnly: true }),
    ]);
    expect(context?.rooms.some((r) => r.type === "match_team")).toBe(false);
    expect(context?.autoOpen).toBe(false);
  });

  it("never adds a Team Chat for staff, even if a lineup were passed", () => {
    const context = matchChatHubContext(match, false, MY_LINEUP, t, true);
    expect(context?.rooms.map((r) => r.type)).toEqual(["match"]);
  });

  it("keeps players exactly as before: Match Chat plus their own Team Chat, writable", () => {
    const context = matchChatHubContext(match, true, MY_LINEUP, t, false);
    expect(context?.rooms.map((r) => [r.type, r.lobbyId, !!r.readOnly])).toEqual([
      ["match", "m1", false],
      ["match_team", "m1:l1", false],
    ]);
  });

  it("a participant who is also staff keeps full participant chat", () => {
    const context = matchChatHubContext(match, true, MY_LINEUP, t, true);
    expect(context?.rooms.every((r) => !r.readOnly)).toBe(true);
    expect(context?.rooms.map((r) => r.type)).toEqual(["match", "match_team"]);
  });

  it("offers nothing to anyone else", () => {
    expect(matchChatHubContext(match, false, null, t, false)).toBeNull();
    expect(matchChatHubContext(match, false, null, t)).toBeNull();
  });
});

describe("match page wiring", () => {
  const page = fs
    .readFileSync(path.resolve(__dirname, "../../pages/matches/[id]/index.vue"), "utf8")
    .replace(/\r\n/g, "\n");

  it("offers the staff room only to moderators and above, while the match runs, when they are not a participant", () => {
    const computed = page.slice(page.indexOf("canStaffReadMatchChat() {"));
    const body = computed.slice(0, computed.indexOf("\n    },"));
    expect(body).toContain("!this.canUseMatchChat");
    expect(body).toContain("useAuthStore().isRoleAbove(e_player_roles_enum.moderator)");
    expect(body).toContain("e_match_status_enum.Live");
    expect(body).not.toContain("Finished");
    expect(page).toMatch(
      /matchChatHubContext\(\s+this\.match,\s+this\.canUseMatchChat,\s+this\.myLineup,\s+\(key, params\) => this\.\$t\(key, params\),\s+this\.canStaffReadMatchChat,/,
    );
  });
});

describe("Chat Hub panel", () => {
  it("shows a read-only Match Chat without a composer and says why", () => {
    const panel = fs
      .readFileSync(path.resolve(__dirname, "../../components/hub/ChatPanel.vue"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(panel).toContain("if (tab.readOnly) return false;");
    expect(panel).toMatch(
      /if \(tab\.readOnly && tab\.type === "match"\) \{\s+return t\("chat\.match_staff_readonly"\);/,
    );
    const en = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../i18n/locales/en.json"), "utf8"),
    );
    expect(en.chat.match_staff_readonly).toMatch(/read/i);
    expect(en.chat.match_staff_readonly).not.toContain("—");
  });
});
