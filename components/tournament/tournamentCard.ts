// Adapted from 5Stack WEB b4b83f23 (components/tournament/tournamentCard.ts);
// MIT Copyright (c) 2025 5Stack.gg.
// Kept out of the SFC because `<script setup>` cannot carry ES exports.
export type TournamentCardVariant = "feature" | "compact" | "simple";

export type TournamentStatusVariant =
  "default" | "finished" | "live" | "registration";

// Curated tournament lists hoist the variant onto a section header ("LIVE",
// "OPEN FOR REGISTRATION"). Mixed-status lists have no such header, so they
// derive it per card. Groupings mirror the /tournaments status filter.
export function tournamentStatusVariant(
  status?: string | null,
): TournamentStatusVariant {
  switch (status) {
    case "Live":
    case "Paused":
      return "live";
    case "RegistrationOpen":
      return "registration";
    case "Finished":
    case "Cancelled":
    case "CancelledMinTeams":
      return "finished";
    default:
      return "default";
  }
}
