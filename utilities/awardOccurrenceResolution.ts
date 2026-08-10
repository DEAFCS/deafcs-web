import { placementForTournamentAwardSlot } from "./tournamentAwardPicker";

export interface TournamentAwardSlotLookupRow {
  tournament_id?: string | null;
  slot: string;
  custom_name?: string | null;
  silhouette_override?: number | null;
  image_override?: string | null;
}

export interface ResolvedAwardArtwork {
  image_url: string | null;
  custom_name: string | null;
  silhouette: number | null;
}

/**
 * Priority: explicit per-tournament slot override, then the live award's own
 * image, then null (callers fall back to AwardBadge's generated artwork).
 * Historical grants intentionally re-resolve the live award image on every
 * read, so editing a built-in award's image updates past tournaments too.
 */
export function resolveAwardArtwork(
  placement: number,
  liveAwardImageUrl: string | null | undefined,
  tournamentId: string | null | undefined,
  slots: TournamentAwardSlotLookupRow[] | null | undefined,
): ResolvedAwardArtwork {
  const slot = (slots || []).find(
    (candidate) =>
      candidate.tournament_id === tournamentId &&
      placementForTournamentAwardSlot(candidate.slot) === placement,
  );
  return {
    image_url: slot?.image_override || liveAwardImageUrl || null,
    custom_name: slot?.custom_name ?? null,
    silhouette: slot?.silhouette_override ?? null,
  };
}

export interface AwardRecipientRow {
  id: string;
  team_id?: string | null;
  player_steam_id?: string | number | null;
  tournament_team_id?: string | null;
  occurrence?: {
    id: string;
    tournament_id: string;
    placement: number;
    award?: { image_url?: string | null } | null;
    tournament?: {
      name: string;
      start?: string | null;
      stages?: Array<{ type: string }> | null;
    } | null;
  } | null;
  tournament_team?: {
    name?: string | null;
    team_id?: string | null;
    team?: {
      id: string;
      name?: string | null;
      short_name?: string | null;
    } | null;
  } | null;
  team?: {
    id: string;
    name?: string | null;
    short_name?: string | null;
  } | null;
}

/**
 * Flattens a live award_recipients row (award_recipients -> award_occurrences
 * -> awards) into the same shape AwardCase/AwardModal already consume, so
 * those display components don't need to change. `trophy_config.image_url`
 * is resolved fresh on every read via resolveAwardArtwork.
 */
export function mapAwardRecipientToTrophy(
  recipient: AwardRecipientRow,
  slots: TournamentAwardSlotLookupRow[] | null | undefined,
) {
  const occurrence = recipient.occurrence;
  const placement = occurrence?.placement ?? 0;
  const artwork = resolveAwardArtwork(
    placement,
    occurrence?.award?.image_url,
    occurrence?.tournament_id,
    slots,
  );

  return {
    id: recipient.id,
    placement,
    tournament_id: occurrence?.tournament_id,
    team_id: recipient.team_id,
    tournament: occurrence?.tournament ?? null,
    tournament_team: recipient.tournament_team ?? null,
    team: recipient.team ?? null,
    trophy_config: {
      custom_name: artwork.custom_name,
      silhouette: artwork.silhouette,
      image_url: artwork.image_url,
    },
  };
}
