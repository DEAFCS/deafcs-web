import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

// The real team award UI (shelf, hero, award modal, directory rows) fed with
// DEAFCS-shaped award_recipients rows (placement/source on the occurrence, the
// artwork on the award, per-tournament overrides in tournament_award_slots)
// that went through the adapter. Only GraphQL and tooltips are replaced.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: any) => (values !== undefined ? `${key}:${JSON.stringify(values)}` : key),
    locale: { value: "en" },
  }),
}));
vi.mock("~/components/FiveStackToolTip.vue", () => ({
  default: { name: "FiveStackToolTip", template: `<span><slot name="trigger" /><slot /></span>` },
}));

vi.mock("#app", () => ({
  tryUseNuxtApp: () => null,
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ resolve: () => ({ href: "" }), push: () => {} }),
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: null, isRoleAbove: () => false }),
}));

const h = vi.hoisted(() => ({
  teams: [] as any[],
  recipients: [] as any[],
  slots: [] as any[],
  teamQueries: [] as any[],
}));

vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({
    client: {
      subscribe: ({ query }: any) => {
        const text = JSON.stringify(query);
        return {
          subscribe: (handlers: any) => {
            handlers.next({
              data: text.includes('"award_recipients"') ? { award_recipients: h.recipients } : { matches: [] },
            });
            return { unsubscribe: vi.fn() };
          },
        };
      },
      query: async ({ query, variables }: any) => {
        const text = JSON.stringify(query);
        if (text.includes("SchemaTypeFields")) {
          return { data: { __type: { fields: [{ name: "last_match_at" }, { name: "created_at" }] } } };
        }
        if (text.includes('"tournament_award_slots"')) {
          return { data: { tournament_award_slots: h.slots } };
        }
        if (text.includes('"teams"')) {
          h.teamQueries.push(variables);
          const ids: string[] | undefined = variables.where?._and?.find((c: any) => c.id)?.id?._in;
          const rows = ids ? h.teams.filter((t) => ids.includes(t.id)) : h.teams;
          return { data: { teams: rows, teams_aggregate: { aggregate: { count: rows.length } } } };
        }
        return { data: {} };
      },
    },
  }),
}));

import TeamsAwardShelf from "../../components/teams/TeamsAwardShelf.vue";
import TeamsDirectory from "../../components/teams/TeamsDirectory.vue";
import TeamHero from "../../components/team/TeamHero.vue";
import AwardArtwork from "../../components/award/AwardArtwork.vue";
import AwardBadge from "../../components/award/AwardBadge.vue";
import { recipientToGrant } from "../../components/teams/teamAwards";

function recipient(id: string, teamId: string, placement: number, tournamentId: string, tournamentName: string, over: Record<string, any> = {}) {
  const tier = ["mvp", "gold", "silver", "bronze"][placement] ?? "bronze";
  return {
    id,
    team_id: teamId,
    player_steam_id: null,
    created_at: "2026-09-27T10:00:00Z",
    occurrence: {
      id: `occ-${id}`,
      tournament_id: tournamentId,
      placement,
      source: "tournament",
      award: { id: `award-${tier}`, name: `${placement === 1 ? "1st" : placement === 2 ? "2nd" : "3rd"} Place`, tier, silhouette: null, image_url: null, system_key: `tournament_${tier}` },
      tournament: { id: tournamentId, name: tournamentName, start: `2026-09-${10 + placement}T10:00:00Z`, stages: [{ type: "DoubleElimination" }] },
      ...over,
    },
    tournament_team: { name: "Samurai", team_id: teamId, team: { id: teamId, name: "Samurai", short_name: "SAM" } },
    team: { id: teamId, name: "Samurai", short_name: "SAM" },
  } as any;
}

// Champion and runner-up overrides for two tournaments; the third has none.
const slots = [
  { tournament_id: "t1", slot: "champion", custom_name: "Grand Champions", silhouette_override: null, image_override: "avatars/awards/grand.webp" },
  { tournament_id: "t2", slot: "runner_up", custom_name: "Finalists", silhouette_override: 3, image_override: null },
];
const recipients = [
  recipient("r1", "team-1", 1, "t1", "5v5 Cup #1"),
  recipient("r2", "team-1", 2, "t2", "2v2 Cup (Beta #1)"),
  recipient("r3", "team-1", 3, "t3", "1v1 Cup (Beta #2)"),
];
// AwardArtwork itself hands an explicit procedural silhouette to AwardBadge;
// that is the only place a badge may appear. No surface renders one directly.
function badgesOutsideArtwork(wrapper: any) {
  return wrapper
    .findAllComponents(AwardBadge)
    .filter((badge: any) => badge.vm.$parent?.$options?.__name !== "AwardArtwork" && badge.vm.$parent?.$options?.name !== "AwardArtwork");
}
const grants = () => recipients.map((row) => recipientToGrant(row, slots));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  vi.stubGlobal("useRouter", () => ({ push: vi.fn() }));
  vi.stubGlobal("useAuthStore", () => ({ me: null, isRoleAbove: () => false }));
  h.teams = [
    { id: "team-1", name: "Samurai", short_name: "SAM", avatar_url: null, is_organization: false, ranks: { avg_elo: 1800 }, roster: [], recent_results: [], last_match_at: null },
    { id: "team-2", name: "Hand Granted", short_name: "HG", avatar_url: null, is_organization: false, ranks: { avg_elo: 1500 }, roster: [], recent_results: [], last_match_at: null },
  ];
  h.slots = slots;
  h.teamQueries = [];
});
afterEach(() => vi.unstubAllGlobals());

const mountOpts = {
  attachTo: document.body,
  global: {
    config: { globalProperties: { $t: (k: string, v?: any) => (v !== undefined ? `${k}:${JSON.stringify(v)}` : k) } as any },
    stubs: { NuxtLink: { props: ["to"], template: "<a><slot /></a>" }, TooltipProvider: false },
  },
};

describe("team award shelf renders DEAFCS awards through AwardArtwork", () => {
  it("renders one AwardArtwork per award, with slot-overridden artwork and names", () => {
    const wrapper = mount(TeamsAwardShelf, { props: { awards: grants(), max: 5 }, ...mountOpts });
    const artworks = wrapper.findAllComponents(AwardArtwork);
    expect(artworks).toHaveLength(3);
    // Never the upstream badge.
    expect(badgesOutsideArtwork(wrapper)).toHaveLength(0);

    const labels = wrapper.findAll("button").map((b) => b.attributes("aria-label"));
    // Newest first: names come from the tournament (no slot name on this
    // surface when a custom name exists it wins), placement from the occurrence.
    expect(labels).toContain("3rd Place, 1v1 Cup (Beta #2)");
    expect(labels).toContain("1st Place, Grand Champions");
    expect(labels).toContain("2nd Place, Finalists");

    // Champion override: the tournament's own uploaded artwork is what shows.
    const champion = wrapper.get('button[aria-label="1st Place, Grand Champions"]');
    expect(champion.get("img").attributes("src")).toContain("avatars/awards/grand.webp");
    // Runner-up override: a procedural silhouette instead of the tier icon.
    expect(artworks.some((a) => (a.props("award") as any).silhouette === 3)).toBe(true);
    // No override: the plain tier definition.
    const bronze = artworks.find((a) => (a.props("award") as any).tier === "bronze");
    expect((bronze?.props("award") as any).image_url).toBeNull();
    wrapper.unmount();
  });

  it("collapses extra awards into a +N counter", () => {
    const wrapper = mount(TeamsAwardShelf, { props: { awards: grants(), max: 2 }, ...mountOpts });
    expect(wrapper.findAllComponents(AwardArtwork)).toHaveLength(2);
    expect(wrapper.text()).toContain("+1");
    wrapper.unmount();
  });
});

describe("team hero award row", () => {
  const team = {
    id: "team-1",
    name: "Samurai",
    short_name: "SAM",
    avatar_url: null,
    ranks: null,
    reputation: null,
    roster: [{ player: { steam_id: "7", name: "Captain Bod", avatar_url: null } }],
    captain: { steam_id: "7", name: "Captain Bod", avatar_url: null },
    owner: { steam_id: "7", name: "Captain Bod", avatar_url: null },
  };

  it("sorts medals gold to bronze, renders AwardArtwork and opens the DEAFCS award modal", async () => {
    const wrapper = mount(TeamHero, {
      props: { team, awards: grants().reverse(), matchesCount: 3 },
      ...mountOpts,
    });
    await flushPromises();
    expect(badgesOutsideArtwork(wrapper)).toHaveLength(0);
    const buttons = wrapper.findAll('[role="group"] button');
    expect(buttons.map((b) => b.attributes("aria-label"))).toEqual(["Grand Champions", "Finalists", "1v1 Cup (Beta #2)"]);

    await buttons[0].trigger("click");
    await flushPromises();
    // AwardModal takes the DEAFCS trophy: placement label, custom name,
    // tournament and the team recipient.
    const modalText = document.body.textContent ?? "";
    expect(modalText).toContain("awards.first_place");
    expect(modalText).toContain("Grand Champions");
    expect(modalText).toContain("5v5 Cup #1");
    expect(modalText).toContain("Samurai");
    wrapper.unmount();
  });
});

// The directory waits on a schema check, then on its (deferred) loading state.
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await flushPromises();
}

describe("teams directory", () => {
  it("shows awards on the row and Tournament Winners filters to tournament placements only", async () => {
    // team-1: tournament placements; team-2: only a hand-granted award.
    h.recipients = [
      ...recipients,
      recipient("r9", "team-2", 1, "t9", "Friendly Cup", { source: "manual", tournament_id: null }),
    ];
    const wrapper = mount(TeamsDirectory, { props: { showCreate: false }, ...mountOpts });
    await settle();

    const rows = wrapper.findAll("a").map((a) => a.text());
    expect(rows.some((t) => t.includes("Samurai"))).toBe(true);
    expect(rows.some((t) => t.includes("Hand Granted"))).toBe(true);
    // The row's shelf: three tournament awards for Samurai, rendered as artwork.
    expect(wrapper.findAllComponents(AwardArtwork).length).toBeGreaterThanOrEqual(3);
    expect(badgesOutsideArtwork(wrapper)).toHaveLength(0);

    (wrapper.vm as any).winnersOnly = true;
    await settle();
    const last = h.teamQueries.at(-1);
    expect(last.where._and).toContainEqual({ id: { _in: ["team-1"] } });
    expect(wrapper.text()).toContain("Samurai");
    expect(wrapper.text()).not.toContain("Hand Granted");
    wrapper.unmount();
  });
});
