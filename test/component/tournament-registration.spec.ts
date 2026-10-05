import { describe, expect, it, vi } from "vitest";
import { reactive, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { valueFromASTUntyped } from "graphql";
import { tournamentEloLadder, tournamentPlayerElo } from "../../utilities/tournamentElo";
import { tournamentRegistrationCount } from "../../utilities/tournamentRegistrationCount";
import { checkInTimeline, isTournamentScheduleFrozen } from "../../utilities/tournamentCheckIn";
import { registrationColumns, registrationFormValues } from "../../utilities/tournamentRegistration";

describe("DEAFCS unified tournament presentation", () => {
  it.each(["Competitive", "Wingman", "Duel"])("reads the existing %s mode rating", mode => {
    const cup = { options: { type: mode }, max_players_per_lineup: 7 };
    expect(tournamentEloLadder(cup)).toBe(mode);
    expect(tournamentPlayerElo(cup, { elo: { competitive: 7100, wingman: 4300, duel: 8900, tournament_competitive: 999 } })).toBe({Competitive:7100,Wingman:4300,Duel:8900}[mode]);
  });
  it("uses Duel for one-player fallback and 5000 for a new player", () => {
    expect(tournamentEloLadder({min_players_per_lineup:1})).toBe("Duel");
    expect(tournamentPlayerElo({options:{type:"Duel"}}, {})).toBe(5000);
  });
  it("counts solo and mixed capacity as players, with premades consuming slots", () => {
    const cup = {registration_version:2, registration_type:"both", options:{type:"Wingman"}, stages:[{max_teams:4}],teams_aggregate:{aggregate:{count:2}},free_agents_aggregate:{aggregate:{count:3}}};
    expect(tournamentRegistrationCount(cup)).toEqual({count:7,capacity:8,unit:"players"});
    expect(tournamentRegistrationCount({...cup,registration_type:"teams"})).toEqual({count:2,capacity:4,unit:"teams"});
  });
  it("keeps historical Random participation counts", () => {
    expect(tournamentRegistrationCount({registration_version:1,options:{type:"Competitive",individual_registration_enabled:true},stages:[{max_teams:4}],individual_signups_aggregate:{aggregate:{count:17}}})).toEqual({count:17,capacity:20,unit:"players"});
  });
  it("keeps match-ready settings independent of tournament check-in settings", () => {
    const row={registration_type:"free_agents",min_role:"verified_user",min_elo:4000,max_elo:8000,invite_only:true,check_in_required:true,check_in_setting:"Players",check_in_opens_before_minutes:60,check_in_closes_before_minutes:15};
    const values={...registrationFormValues(row),check_in_setting:"Captains"};
    expect(registrationColumns(values)).toEqual(row);
    expect(values.check_in_setting).toBe("Captains");
  });
  it("draws the local-time timeline and freezes from persisted check-in state", () => {
    const timeline=checkInTimeline("2026-10-05T18:00:00Z",60,15)!;
    expect(timeline.opensAt.toISOString()).toBe("2026-10-05T17:00:00.000Z");
    expect(timeline.closesAt.toISOString()).toBe("2026-10-05T17:45:00.000Z");
    expect(isTournamentScheduleFrozen({check_in_started:true})).toBe(true);
    expect(isTournamentScheduleFrozen({check_in_started:false})).toBe(false);
  });
});

describe("tournament invitation notifications", () => {
  it("requests only addressed invitations, preserves the unread badge, and clears them on logout", async () => {
    const steamId = "76561190000000001";
    const auth = reactive({ me: null as null | { steam_id: string }, isAdmin: true });
    const requests: any[] = [];
    vi.doMock("~/graphql/getGraphqlClient", () => ({ default: () => ({
      subscribe: (request: any) => ({ subscribe: (observer: any) => {
        const unsubscribe = vi.fn();
        requests.push({ ...request, observer, unsubscribe });
        return { unsubscribe };
      } }),
    }) }));
    vi.doMock("~/composables/useInAppNotificationPreferences", () => ({
      fetchInAppNotificationPreferences: async () => ({}),
    }));
    vi.stubGlobal("useAuthStore", () => auth);
    vi.stubGlobal("useApplicationSettingsStore", () => ({ seasonsEnabled: false, newsEnabled: false }));
    setActivePinia(createPinia());
    const { useNotificationStore } = await import("../../stores/NotificationStore");
    const store = useNotificationStore();
    try {
      auth.me = { steam_id: steamId };
      await nextTick();
      const incoming = requests.find(request => request.query.definitions[0].selectionSet.selections[0].name.value === "tournament_invites");
      expect(incoming).toBeDefined();
      const args = incoming.query.definitions[0].selectionSet.selections[0].arguments;
      const where = valueFromASTUntyped(args.find((arg: any) => arg.name.value === "where").value, incoming.variables);
      expect(where).toEqual({ _or: [
        { steam_id: { _eq: steamId } },
        { team: { owner_steam_id: { _eq: steamId } } },
        { team: { captain_steam_id: { _eq: steamId } } },
        { team: { roster: { role: { _eq: "Admin" }, player_steam_id: { _eq: steamId } } } },
      ] });
      incoming.observer.next({ data: { tournament_invites: [{ id: "incoming-player-invite" }] } });
      expect(store.unreadNotificationCount).toBe(1);
      expect(store.hasPersonalNotifications).toBe(true);
      auth.me = null;
      await nextTick();
      expect(incoming.unsubscribe).toHaveBeenCalledOnce();
      expect(store.tournament_registration_invites).toEqual([]);
      expect(store.unreadNotificationCount).toBe(0);
    } finally {
      store.$dispose();
      vi.unstubAllGlobals();
      vi.doUnmock("~/graphql/getGraphqlClient");
      vi.doUnmock("~/composables/useInAppNotificationPreferences");
    }
  });
});
