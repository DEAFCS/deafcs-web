import { Trophy, Layers } from "lucide-vue-next";
import type { Component } from "vue";

export type MatchSourceKind = "tournament" | "league" | "draft" | "matchmaking";

interface SourceableMatch {
  is_tournament_match?: boolean | null;
  tournament_brackets?: Array<{
    stage?: {
      tournament?: {
        league_season_division?: { id: string } | null;
      } | null;
    } | null;
  }> | null;
  draft_games?: Array<{ id: string }> | null;
}

// Classifies a match the same way MatchTableRow.vue already does for
// "is this a tournament match" (is_tournament_match computed field OR a
// tournament_brackets row), then narrows Tournament down to League via the
// existing tournament.league_season_division relationship -- the same
// relationship graphql/tournamentFilters.ts's NOT_LEAGUE_TOURNAMENT filter
// uses to separate league-owned tournaments from regular ones. No new
// backend fields; every field here is already exposed on `matches`.
export function getMatchSource(
  match: SourceableMatch | null | undefined,
): MatchSourceKind {
  if (!match) return "matchmaking";

  const isTournamentMatch = Boolean(
    match.is_tournament_match || match.tournament_brackets?.length,
  );
  if (isTournamentMatch) {
    const bracket = match.tournament_brackets?.[0];
    return bracket?.stage?.tournament?.league_season_division
      ? "league"
      : "tournament";
  }

  if (match.draft_games?.length) return "draft";

  return "matchmaking";
}

// Tournament -> Trophy (matches MatchTableRow.vue's existing tournament-match
// pill/row icon exactly). League -> Layers, reusing the icon
// components/teams/TeamLeagueHistory.vue and
// components/notification/LeagueScheduleStack.vue already use for
// league/division context elsewhere in the app -- not a new arbitrary
// choice. Matchmaking/Draft -> null (no icon at all, not a generic
// placeholder glyph).
export function matchSourceIcon(source: MatchSourceKind): Component | null {
  if (source === "tournament") return Trophy;
  if (source === "league") return Layers;
  return null;
}
