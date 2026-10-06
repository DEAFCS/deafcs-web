import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string, v?: any) => (v ? `${k}:${JSON.stringify(v)}` : k) }),
}));

import {
  filterTournamentMatches,
  sortTournamentMatches,
  tournamentMatchBucket,
  tournamentMatchCounts,
} from "../../utilities/tournamentMatches";
import { tournamentProgress } from "../../utilities/tournamentProgress";
import TournamentProgress from "../../components/tournament/TournamentProgress.vue";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const $t = (k: string, v?: any) => (v ? `${k}:${JSON.stringify(v)}` : k);

describe("tournament Matches tab grouping", () => {
  it("buckets statuses like /watch: live, upcoming, results; canceled only under All", () => {
    expect(tournamentMatchBucket("Live")).toBe("live");
    expect(tournamentMatchBucket("Veto")).toBe("live");
    expect(tournamentMatchBucket("WaitingForCheckIn")).toBe("live");
    expect(tournamentMatchBucket("PickingPlayers")).toBe("live");
    expect(tournamentMatchBucket("Scheduled")).toBe("upcoming");
    expect(tournamentMatchBucket("Finished")).toBe("results");
    expect(tournamentMatchBucket("Forfeit")).toBe("results");
    expect(tournamentMatchBucket("Canceled")).toBeNull();
  });

  it("sorts live first, then upcoming soonest, then results newest", () => {
    const sorted = sortTournamentMatches([
      { id: "old", status: "Finished", ended_at: "2026-10-01T10:00:00Z" },
      { id: "later", status: "Scheduled", scheduled_at: "2026-10-06T20:00:00Z" },
      { id: "live", status: "Live" },
      { id: "new", status: "Finished", ended_at: "2026-10-02T10:00:00Z" },
      { id: "soon", status: "Scheduled", scheduled_at: "2026-10-06T18:00:00Z" },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["live", "soon", "later", "new", "old"]);
  });

  it("filters and counts", () => {
    const matches = [{ status: "Live" }, { status: "Scheduled" }, { status: "Finished" }, { status: "Canceled" }];
    expect(tournamentMatchCounts(matches)).toEqual({ all: 4, live: 1, upcoming: 1, results: 1 });
    expect(filterTournamentMatches(matches, "results")).toHaveLength(1);
    expect(filterTournamentMatches(matches, "all")).toHaveLength(4);
  });
});

const stage = (order: number, brackets: any[], over: Record<string, any> = {}) => ({
  order,
  type: "SingleElimination",
  e_tournament_stage_type: { description: "Single Elimination" },
  brackets,
  ...over,
});
const b = (round: number, status: string | null, over: Record<string, any> = {}) => ({
  round,
  bye: false,
  match: status ? { status } : null,
  ...over,
});

describe("tournament progress", () => {
  it("no drawn brackets: nothing to show", () => {
    expect(tournamentProgress([stage(1, [])])).toBeNull();
    expect(tournamentProgress(undefined)).toBeNull();
  });

  it("current stage, round and decided count; byes never count", () => {
    const p = tournamentProgress([
      stage(1, [b(1, "Finished"), b(1, "Live"), b(1, null, { bye: true }), b(2, null), b(3, null)]),
    ])!;
    expect(p).toMatchObject({ stageNumber: 1, stageCount: 1, round: 1, rounds: 3, decided: 1, total: 4, live: 1, complete: false });
  });

  it("moves to the next stage once the first is decided and finds the next start", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    const p = tournamentProgress(
      [
        stage(2, [b(1, "Scheduled", { scheduled_at: "2026-10-05T18:00:00Z" }), b(1, "Scheduled", { scheduled_at: "2026-10-05T16:00:00Z" })], {
          e_tournament_stage_type: { description: "Playoffs" },
        }),
        stage(1, [b(1, "Finished"), b(2, "Forfeit")], { type: "Swiss", e_tournament_stage_type: { description: "Swiss" }, max_rounds: 5 }),
      ],
      now,
    )!;
    expect(p).toMatchObject({ stageNumber: 2, stageCount: 2, stageLabel: "Playoffs", round: 1, decided: 0, total: 2, live: 0 });
    expect(p.nextAt).toBe("2026-10-05T16:00:00Z");
  });

  it("Swiss rounds use max_rounds when later rounds are not drawn yet", () => {
    const p = tournamentProgress([
      stage(1, [b(1, "Finished"), b(1, "Live")], { type: "Swiss", max_rounds: 5 }),
    ])!;
    expect(p.rounds).toBe(5);
  });

  it("everything decided: complete", () => {
    expect(tournamentProgress([stage(1, [b(1, "Finished"), b(2, "Finished")])])!.complete).toBe(true);
  });

  it("the strip shows stage, round, matches, live count and links to Bracket/Matches", async () => {
    const tournament = {
      status: "Live",
      stages: [stage(1, [b(1, "Finished"), b(1, "Live"), b(2, null)])],
    };
    const w = mount(TournamentProgress, {
      props: { tournament, showMatchesLink: true },
      global: { mocks: { $t }, stubs: { TimeAgo: true } },
    });
    expect(w.find('[data-testid="tournament-progress-stage"]').text()).toContain("Single Elimination");
    expect(w.find('[data-testid="tournament-progress-round"]').text()).toContain('round_of:{"number":1,"count":2}');
    expect(w.find('[data-testid="tournament-progress-matches"]').text()).toContain('"decided":1,"total":3');
    expect(w.find('[data-testid="tournament-progress-live"]').exists()).toBe(true);
    await w.find('[data-testid="tournament-progress-matches-link"]').trigger("click");
    await w.find('[data-testid="tournament-progress-bracket-link"]').trigger("click");
    expect(w.emitted("open-tab")).toEqual([["matches"], ["bracket"]]);
  });

  it("no Matches link before matches exist", () => {
    const w = mount(TournamentProgress, {
      props: { tournament: { stages: [stage(1, [b(1, "Scheduled")])] }, showMatchesLink: false },
      global: { mocks: { $t }, stubs: { TimeAgo: true } },
    });
    expect(w.find('[data-testid="tournament-progress-matches-link"]').exists()).toBe(false);
  });

  it("does not announce competition rounds during registration", () => {
    const w = mount(TournamentProgress, {
      props: { tournament: { status: "RegistrationOpen", stages: [stage(1, [b(1, "Scheduled")])] } },
      global: { mocks: { $t }, stubs: { TimeAgo: true } },
    });
    expect(w.find('[data-testid="tournament-progress"]').exists()).toBe(false);
  });
});

describe("tournament page navigation (adapted from 5Stack's five-tab page)", () => {
  const detail = read("components/tournament/TournamentDetail.vue");

  it("Bracket is its own tab; the Overview no longer renders it", () => {
    expect(detail).toContain('<TabsContent value="bracket">');
    expect(detail.match(/<TournamentStageBuilder/g)).toHaveLength(1);
    const overview = detail.slice(
      detail.indexOf('<TabsContent value="overview">'),
      detail.indexOf('<TabsContent value="bracket">'),
    );
    expect(overview).not.toContain("<TournamentStageBuilder");
    expect(overview).toContain("<TournamentProgress");
    expect(overview).toContain("<TournamentMatchSetup");
    // Existing DEAFCS Overview sections stay.
    for (const keep of ["<TournamentStatRibbon", "<TournamentRewards"]) {
      expect(overview).toContain(keep);
    }
    const entryArea = detail.slice(detail.indexOf('data-testid="tournament-entry-area"'), detail.indexOf('<TabsContent value="overview">'));
    expect(entryArea).toContain("<TournamentCheckInInfo");
  });

  it("tab order puts Bracket and Matches right after Overview / My Team", () => {
    expect(detail).toMatch(/tabs\.push\("my-team"\);\n\s+\}\n\n\s+tabs\.push\("bracket"\);\n\n\s+if \(this\.matchesTabVisible\) \{\n\s+tabs\.push\("matches"\);\n\s+\}\n\n\s+tabs\.push\("teams"\);/);
    expect(detail).toContain('<TournamentMatches :tournament-id="tournament.id">');
  });

  it("Matches appears once the draw is published and stays through Finished", () => {
    const block = detail.slice(detail.indexOf("matchesTabVisible() {"), detail.indexOf("tournamentEffectiveSubstitutes() {"));
    for (const status of ["RegistrationClosed", "Live", "Paused", "Finished"]) {
      expect(block).toContain(`e_tournament_status_enum.${status}`);
    }
    expect(block).not.toContain("RegistrationOpen");
  });

  it("the Matches tab follows the current 5Stack paginated neutral-row architecture", () => {
    const matches = read("components/tournament/TournamentMatches.vue");
    expect(matches).toContain('import PlayerMatchesTable from "~/components/player/PlayerMatchesTable.vue";');
    expect(matches).toContain("simpleMatchFields");
    expect(matches).toContain("useMatchRowStats(pageMatches)");
    expect(matches).toContain('usePerPage("tournament-matches")');
    expect(matches).toContain("neutral");
    expect(matches).toContain("tournament-times");
    expect(matches).toContain("show-per-page-selector");
    expect(matches).toMatch(/tournament_brackets: \{\n\s+stage: \{ tournament_id: \{ _eq: \$\("tournamentId", "uuid!"\) \} \},/);
  });

  it("neutral rows preserve DEAFCS labels, timezone UI and unknown historical scores", () => {
    const row = read("components/player/PlayerMatchRow.vue");
    expect(row).toContain("<TournamentTime");
    expect(row).toContain("matchSeriesLabel(this.match?.options?.best_of)");
    expect(row).toContain("cleanMapName(m.label || m.name || \"\")");
    expect(row).toContain('team.score ?? "—"');
    expect(row).toContain("supportsTournamentMvp(this.match)");
  });
});

describe("follow a team through the bracket", () => {
  const match = read("components/tournament/TournamentMatch.vue");
  const viewer = read("components/tournament/TournamentBracketViewer.vue");
  const builder = read("components/tournament/TournamentStageBuilder.vue");
  const view = read("composables/useBracketView.ts");

  it("shared state, select in both bracket toolbars once teams are drawn", () => {
    expect(view).toContain("const followTeamId = ref<string | null>(null);");
    expect(builder.match(/<BracketFollowSelect\n\s+v-if="followable"/g)).toHaveLength(2);
  });

  it("cards carry their team ids and ring when followed", () => {
    expect(match).toContain(':data-teams="bracketTeamIds(bracket)"');
    expect(match).toContain("'ring-2 ring-[hsl(var(--tac-amber))] ring-offset-2 ring-offset-background':\n          isFollowed(bracket),");
    // 5Stack card treatment: state is a border on a flat charcoal card, the
    // followed path is amber and everything off it dims.
    expect(match).toContain('"border-emerald-500/70 shadow-[0_0_0_1px_rgb(16_185_129/0.25)]"');
    expect(match).toContain('? "border-[hsl(var(--tac-amber))]"');
    expect(match).toContain('following && !onPath && "opacity-30"');
    // The followed team's own row is tinted, and rows are tagged for the
    // connector lines to land on.
    expect(match).toContain(":data-feed=\"getFeedForSlot(bracket, slot)?.id\"");
  });

  it("only the followed team's winner path changes colour; lines redraw on change", () => {
    expect(viewer).toContain("watch([effectiveZoom, followTeamId], () => {");
    expect(viewer).toMatch(/onPath\n\s+\? "hsl\(var\(--tac-amber\)\)"\n\s+: type === "winner"\n\s+\? "hsl\(var\(--muted-foreground\) \/ 0\.35\)"\n\s+: "hsl\(0 72% 64% \/ 0\.35\)",/);
    // Loser drops are dashed; lines land on the team's slot row.
    expect(viewer).toContain('if (type === "loser") path.setAttribute("stroke-dasharray", "4 4");');
    expect(viewer).toContain("const targetY = slotCenterY(targetEl, sourceEl.dataset.bracketId || \"\");");
  });
});
