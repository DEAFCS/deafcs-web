// Plain-language replacements for the raw database/permission errors the
// tournament join form can hit. Returns an i18n key, or null to keep the
// original message. Keyed on constraint names (see api-deafcs
// hasura/triggers/tournament_teams.sql) and, for the generic permission
// failure, only on the team registration mutation.
export function tournamentRegistrationErrorKey(error: {
  message?: string;
  extensions?: { path?: string } | Record<string, unknown>;
}): string | null {
  const message = error.message ?? "";
  const path = String((error.extensions as { path?: unknown })?.path ?? "");

  if (message.includes("tournament_teams_tournament_id_team_id_key")) {
    return "tournament.join.error_team_already_registered";
  }
  if (message.includes("tournament_roster_pkey")) {
    return "tournament.join.error_player_already_registered";
  }
  if (
    message.includes("tournament_teams_owner_tournament_only_key") ||
    message.includes("tournament_teams_creator_steam_id_tournament_id_key")
  ) {
    return "tournament.join.error_already_registered_own_team";
  }
  if (
    path.includes("insert_tournament_teams_one") &&
    /check constraint of an insert\/update permission has failed/i.test(message)
  ) {
    return "tournament.join.error_no_permission";
  }
  return null;
}
