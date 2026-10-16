import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import en from "../../i18n/locales/en.json";

// DEAFCS: one entry per tournament. A player on a team (or who owns one) is not
// offered the Free Agent sign-up, and is told why. The API is what enforces it.
const me = { steam_id: "100" };
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@vue/apollo-composable", () => ({ useApolloClient: () => ({ client: { mutate: vi.fn() } }) }));
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => ({ me }) }));
vi.mock("~/stores/MatchmakingStore", () => ({ useMatchmakingStore: () => ({ currentLobby: null }) }));
vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/utilities/tournamentActions", () => ({ runTournamentAction: vi.fn() }));
vi.mock("~/components/PlayerDisplay.vue", () => ({ default: defineComponent({ setup: () => () => h("span") }) }));

let SignUp: any;
beforeAll(async () => {
  SignUp = (await import("../../components/tournament/TournamentFreeAgentSignUp.vue")).default;
});

const tournament = (teams: any[] = []) => ({
  id: "t",
  status: "RegistrationOpen",
  registration_version: 2,
  registration_type: "both",
  min_players_per_lineup: 5,
  options: {},
  teams,
});

const render = (teams: any[]) =>
  mount(SignUp, {
    props: { tournament: tournament(teams) },
    global: { mocks: { $t: (key: string) => key } },
  });

describe("Free Agent sign-up and an existing team entry", () => {
  it("offers the sign-up to a player with no team in the tournament", () => {
    const w = render([{ owner_steam_id: "9", roster: [{ player_steam_id: "8" }] }]);
    expect(w.text()).toContain("tournament.free_agents.sign_up");
    expect(w.find("[data-testid='free-agent-team-entry']").exists()).toBe(false);
  });

  it("explains instead of offering it to a rostered player", () => {
    const w = render([{ owner_steam_id: "9", roster: [{ player_steam_id: "100" }] }]);
    expect(w.find("button").exists()).toBe(false);
    expect(w.find("[data-testid='free-agent-team-entry']").text()).toBe(
      "tournament.free_agents.already_on_team",
    );
  });

  it("explains instead of offering it to a team owner who is not on the roster", () => {
    const w = render([{ owner_steam_id: "100", roster: [] }]);
    expect(w.find("button").exists()).toBe(false);
    expect(w.find("[data-testid='free-agent-team-entry']").text()).toBe(
      "tournament.free_agents.already_own_team",
    );
  });

  it("has short English copy without em dashes", () => {
    const copy = [
      en.tournament.free_agents.already_on_team,
      en.tournament.free_agents.already_own_team,
      en.tournament.join.free_agent_already,
    ];
    for (const line of copy) {
      expect(line).toBeTruthy();
      expect(line).not.toContain("—");
    }
  });
});
