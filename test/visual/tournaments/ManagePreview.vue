<script setup lang="ts">
import { ref } from "vue";
import TournamentManage from "../../../components/tournament/TournamentManage.vue";
import TournamentStageBuilder from "../../../components/tournament/TournamentStageBuilder.vue";
const section = ref(new URLSearchParams(location.search).get("section") || "stages");
const historical = new URLSearchParams(location.search).has("historical");
const stages = [{ id: "s1", order: 1, type: "DoubleElimination", groups: 1, min_teams: 4, max_teams: 8, default_best_of: 3, settings: {}, e_tournament_stage_type: { description: "Double Elimination" }, brackets: [] }, { id: "s2", order: 2, type: "SingleElimination", groups: 1, min_teams: 4, max_teams: 4, default_best_of: 5, decider_best_of: 3, settings: {}, e_tournament_stage_type: { description: "Single Elimination" }, brackets: [] }];
const tournament = {
  id: "00000000-0000-4000-8000-000000000001", name: "DEAFCS Autumn Championship with a long tournament title", status: historical ? "Finished" : "Setup", is_organizer: true,
  registration_version: historical ? 1 : 2, registration_type: "both", start: new Date(Date.now() + 86400000).toISOString(), description: "Local tournament component preview", teams: [], stages, admin: { steam_id: "1", name: "DEAFCS" },
  min_players_per_lineup: 5, max_players_per_lineup: 7, substitutes_enabled: true, trophies_enabled: true, categories: [], prizes: [], organizers: [], organizer_teams: [],
  check_in_required: true, team_check_in_setting: "Players", check_in_opens_before_minutes: 60, check_in_closes_before_minutes: 15,
  options: { id: "00000000-0000-4000-8000-000000000002", type: "Competitive", best_of: 3, mr: 12, map_veto: true, region_veto: true, regions: [], check_in_setting: "Players", ready_setting: "Players", tech_timeout_setting: "Admin", match_mode: "auto", tv_delay: 115, number_of_substitutes: 2, map_pool: { id: "00000000-0000-4000-8000-000000000003", type: "Competitive", maps: [{ id: "m", name: "de_mirage" }, { id: "n", name: "de_nuke" }, { id: "a", name: "de_ancient" }] } },
};
// Drawn and historical variants use the real bracket renderer and local data.
if (historical || new URLSearchParams(location.search).has("bracket")) {
  tournament.status = historical ? "Finished" : "Live";
  const teams = ["Northern Stars with a long team name", "Quiet Force", "Orange Squad", "DEAFCS Denmark"].map((name, i) => ({ id: `t${i}`, name, team: { name }, roster: [] }));
  tournament.teams = teams as any;
  const card = (id: string, group: number, round: number, number: number, extra: any = {}) => ({ id, group, round, match_number: number, path: group === 1 ? "WB" : "LB", bye: false, match: null, feeding_brackets: [], ...extra });
  stages[0].brackets = [
    card("w1", 1, 1, 1, { team_1: teams[0], team_2: teams[1], team_1_seed: 1, team_2_seed: 4, parent_bracket: { id: "w3", group: 1, round: 2 }, loser_bracket: { id: "l1", group: 2, round: 1 } }),
    card("w2", 1, 1, 2, { team_1: teams[2], team_2: teams[3], parent_bracket: { id: "w3", group: 1, round: 2 }, loser_bracket: { id: "l1", group: 2, round: 1 } }),
    card("w3", 1, 2, 3, { parent_bracket: { id: "gf", group: 1, round: 3 }, loser_bracket: { id: "l2", group: 2, round: 2 } }),
    card("gf", 1, 3, 4), card("l1", 2, 1, 5, { parent_bracket: { id: "l2", group: 2, round: 2 } }), card("l2", 2, 2, 6, { parent_bracket: { id: "gf", group: 1, round: 3 } }),
  ] as any;
  stages[1].brackets = [card("s2f", 1, 1, 1)] as any;
}
</script>

<template>
  <main class="mx-auto min-w-0 max-w-[1800px] p-4 sm:p-6">
    <p class="mb-4 text-xs text-muted-foreground">LOCAL COMPONENT FIXTURE</p>
    <div class="mb-6 rounded-lg border border-border bg-card/40 p-5"><h1 class="break-words text-2xl font-bold">{{ tournament.name }}</h1><p class="mt-2 text-sm text-[hsl(var(--tac-amber))]">Competitive · Manage tournament</p></div>
    <TournamentManage :tournament="tournament" :registration="tournament" :check-in-teams="[]" :check-in-review-visible="false" :section="section" @update:section="section=$event" />
    <section class="mt-12 min-w-0"><h2 class="mb-4 text-xl font-bold">Public bracket</h2><TournamentStageBuilder :tournament="tournament" read-only /></section>
  </main>
</template>
