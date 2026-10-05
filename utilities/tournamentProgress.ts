import { tournamentMatchBucket } from "~/utilities/tournamentMatches";

// Where a tournament is right now, from the stages/brackets the detail page
// already subscribes to: which stage and round is being played, how many of
// the drawn matches are decided, how many are live, and when the next
// scheduled one starts. Bye brackets are not matches and never count.

export type TournamentProgress = {
  stageNumber: number;
  stageCount: number;
  stageLabel: string | null;
  round: number | null;
  rounds: number | null;
  decided: number;
  total: number;
  live: number;
  nextAt: string | null;
  complete: boolean;
};

type Bracket = {
  round?: number | null;
  bye?: boolean | null;
  scheduled_at?: string | null;
  match?: { status?: string | null } | null;
};

type Stage = {
  order?: number | null;
  type?: string | null;
  max_rounds?: number | null;
  e_tournament_stage_type?: { description?: string | null } | null;
  brackets?: Bracket[] | null;
};

const isDecided = (b: Bracket) => tournamentMatchBucket(b.match?.status) === "results";

export function tournamentProgress(
  stages: Stage[] | null | undefined,
  now: number = Date.now(),
): TournamentProgress | null {
  const ordered = [...(stages ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((stage) => ({
      stage,
      brackets: (stage.brackets ?? []).filter((b) => !b.bye),
    }));

  const drawn = ordered.filter((s) => s.brackets.length > 0);
  if (!drawn.length) return null;

  const allDecided = (s: (typeof ordered)[number]) => s.brackets.every(isDecided);
  // The stage being played: the first drawn stage with an undecided match;
  // when everything drawn is decided, the last drawn stage.
  const current = drawn.find((s) => !allDecided(s)) ?? drawn[drawn.length - 1];
  const stageIndex = ordered.indexOf(current);

  const brackets = current.brackets;
  const undecided = brackets.filter((b) => !isDecided(b));
  const maxDrawnRound = Math.max(0, ...brackets.map((b) => b.round ?? 0));
  const rounds = Math.max(maxDrawnRound, current.stage.max_rounds ?? 0) || null;
  const round = undecided.length
    ? Math.min(...undecided.map((b) => b.round ?? 0)) || null
    : maxDrawnRound || null;

  const live = ordered.reduce(
    (sum, s) =>
      sum + s.brackets.filter((b) => tournamentMatchBucket(b.match?.status) === "live").length,
    0,
  );

  const upcoming = ordered
    .flatMap((s) => s.brackets)
    .filter((b) => !isDecided(b) && b.scheduled_at && new Date(b.scheduled_at).getTime() > now)
    .map((b) => b.scheduled_at as string)
    .sort();

  const complete = drawn.length === ordered.length && drawn.every(allDecided);

  return {
    stageNumber: stageIndex + 1,
    stageCount: ordered.length,
    stageLabel: current.stage.e_tournament_stage_type?.description ?? current.stage.type ?? null,
    round,
    rounds,
    decided: brackets.length - undecided.length,
    total: brackets.length,
    live,
    nextAt: upcoming[0] ?? null,
    complete,
  };
}
