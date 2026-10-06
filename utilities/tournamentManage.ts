export const tournamentManageSections = [
  { key: "details", label: "Details & branding" },
  { key: "registration", label: "Registration" },
  { key: "teams", label: "Teams & invites" },
  { key: "stages", label: "Stages" },
  { key: "match-rules", label: "Match rules" },
  { key: "prizes", label: "Prizes" },
  { key: "awards", label: "Awards" },
  { key: "organizers", label: "Organizers" },
  { key: "discord", label: "Discord" },
] as const;

export function tournamentManageSection(value: unknown): string {
  return tournamentManageSections.some((section) => section.key === value)
    ? value as string : "details";
}

export const legacyTournamentManageSections: Record<string, string> = {
  information: "details", "match-options": "match-rules", prizes: "prizes",
  trophies: "awards", organizers: "organizers", notifications: "discord", invites: "teams",
};

// Keep structural edits before the draw. Never delete a historical bracket.
export function canManageTournamentStages(tournament: Record<string, any>): boolean {
  return !!tournament.is_organizer && ["Setup", "RegistrationOpen"].includes(tournament.status)
    && !(tournament.stages ?? []).some((stage: any) =>
      (stage.brackets ?? []).some((bracket: any) =>
        bracket.match_id || bracket.match?.id || bracket.team_1?.id || bracket.team_2?.id));
}
