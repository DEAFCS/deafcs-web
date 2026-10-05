// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { e_tournament_status_enum } from "~/generated/zeus";

// The stage a running multi-stage tournament is on, resolved server-side by
// the `current_stage` computed field. Null when there is nothing worth saying.
export function tournamentCurrentStage(tournament: any): any | null {
  if (
    tournament?.status !== e_tournament_status_enum.Live &&
    tournament?.status !== e_tournament_status_enum.Paused
  ) {
    return null;
  }

  const stages = tournament?.stages || [];
  if (new Set(stages.map((stage: any) => stage.order)).size < 2) {
    return null;
  }

  return (
    stages.find((stage: any) => stage.order === tournament.current_stage) ??
    null
  );
}
