import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

// The real DraftPlayerCard / DraftTeamPanel; only their leaf pieces that
// need stores or GraphQL are replaced.
vi.mock("~/components/PlayerDisplay.vue", async () => ({
  default: (await import("./fixtures/playerDisplayStub")).PlayerDisplayStub,
}));
vi.mock("~/components/draft-games/PlayerRanks.vue", () => ({
  default: { name: "PlayerRanks", template: "<span />" },
}));
vi.mock("~/components/FiveStackToolTip.vue", () => ({
  default: { name: "FiveStackToolTip", template: `<span><slot name="trigger" /></span>` },
}));
vi.mock("~/components/draft-games/DraftOpenSlot.vue", () => ({
  default: { name: "DraftOpenSlot", template: "<div />" },
}));

import DraftPlayerCard from "../../components/draft-games/DraftPlayerCard.vue";
import DraftTeamPanel from "../../components/draft-games/DraftTeamPanel.vue";

const t = (key: string, args?: Record<string, unknown>) =>
  args && Object.keys(args).length ? `${key}:${JSON.stringify(args)}` : key;
const global = () => ({ config: { globalProperties: { $t: t } as any } });
const member = (steam_id: string, role = "verified_user") => ({
  steam_id,
  pick_order: 1,
  player: { steam_id, name: `P${steam_id}`, role },
});

beforeEach(() => {
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({ eloForPlayer: () => null }));
  vi.stubGlobal("useAuthStore", () => ({ me: null, isRoleAbove: () => false }));
});
afterEach(() => vi.unstubAllGlobals());

describe("player cards", () => {
  it("draft room default: no profile link and no role icon (cards are dragged there)", () => {
    const card = mount(DraftPlayerCard, { props: { member: member("11") }, global: global() });
    expect(card.find('[data-testid="player-link"]').exists()).toBe(false);
    expect(card.find('[data-testid="role-icon"]').exists()).toBe(false);
  });

  it("read-only views: the avatar/name is a normal in-app profile link (same context), with the role icon", () => {
    // How the Overview uses it: linkable without profileInNewTab, i.e. the
    // site's ordinary NuxtLink navigation. Website stays website, the
    // installed app stays the app; no new window to be captured elsewhere.
    const card = mount(DraftPlayerCard, {
      props: { member: member("11", "moderator"), linkable: true, showRole: true },
      global: global(),
    });
    const link = card.get('[data-testid="player-link"]');
    expect(link.attributes("href")).toBe("/players/11");
    expect(link.attributes("target")).toBeUndefined();
    expect(link.attributes("rel")).toBeUndefined();
    expect(link.get('[data-testid="role-icon"]').attributes("data-role")).toBe("moderator");
  });

  it("team panels pass both through, and their action buttons are never inside the link", () => {
    const panel = mount(DraftTeamPanel, {
      props: {
        title: "Alpha",
        players: [member("11"), member("12")],
        perTeam: 2,
        accent: "amber",
        linkable: true,
        showRole: true,
        removable: true,
      },
      global: global(),
    });
    const links = panel.findAll('[data-testid="player-link"]');
    expect(links.map((l) => l.attributes("href"))).toEqual(["/players/11", "/players/12"]);
    expect(links.map((l) => l.attributes("target"))).toEqual([undefined, undefined]);
    expect(panel.findAll('[data-testid="role-icon"]')).toHaveLength(2);
    const buttons = panel.findAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.element.closest("a")).toBeNull();
    }
    // Without the flags the panel is exactly the draft room's.
    const plain = mount(DraftTeamPanel, {
      props: { title: "Alpha", players: [member("11")], perTeam: 1, accent: "amber" },
      global: global(),
    });
    expect(plain.find('[data-testid="player-link"]').exists()).toBe(false);
    expect(plain.find('[data-testid="role-icon"]').exists()).toBe(false);
  });
});

describe("Overview wiring", () => {
  const source = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("Overview team panels (every stage, Captain Pick included) and the Captain Pick pool link in the same context and show roles", () => {
    for (const [file, tag] of [
      ["components/match/overview/MatchOverview.vue", "DraftTeamPanel"],
      ["components/match/CaptainPickProgress.vue", "DraftPlayerCard"],
    ]) {
      const markup = source(file).match(new RegExp(`<${tag}[\\s\\S]*?/>`))![0];
      expect(markup).toMatch(/\blinkable\s+show-role\b/);
      // No new tab/window: that is what moved website users into the
      // installed app (and app users out of it).
      expect(markup).not.toMatch(/profile-in-new-tab|_blank/);
    }
    expect(source("components/match/overview/OverviewCheckIn.vue")).not.toMatch(/_blank/);
  });

  it("the draft room and Captain Pick screen keep their non-linked cards", () => {
    for (const file of ["components/draft-games/DraftRoom.vue", "components/matchmaking/captain-pick/CaptainPickScreen.vue"]) {
      expect(source(file)).not.toMatch(/\blinkable\b/);
    }
  });
});
