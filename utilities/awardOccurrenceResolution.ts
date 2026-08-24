import { placementForTournamentAwardSlot } from "./tournamentAwardPicker";
import { placementToTier } from "./awardSeed";
import type { AwardArtworkDefinition } from "./awardArtwork";

export interface TournamentAwardSlotLookupRow {
  tournament_id?: string | null;
  slot: string;
  custom_name?: string | null;
  silhouette_override?: number | null;
  image_override?: string | null;
}

/**
 * The live `awards` row behind an occurrence. This is the full definition --
 * not just its image -- because every placement surface renders it through
 * AwardArtwork, which needs the tier/silhouette/system_key to pick between
 * uploaded artwork, a procedural silhouette and the plain tier icon.
 */
export interface AwardDefinitionRow {
  id?: string | null;
  name?: string | null;
  tier?: string | null;
  silhouette?: number | null;
  image_url?: string | null;
  system_key?: string | null;
}

export interface ResolvedAwardArtwork {
  image_url: string | null;
  custom_name: string | null;
  silhouette: number | null;
}

const PLACEMENT_AWARD_NAMES: Readonly<Record<number, string>> = {
  0: "MVP",
  1: "1st Place",
  2: "2nd Place",
  3: "3rd Place",
};

function slotOverrideFor(
  placement: number,
  tournamentId: string | null | undefined,
  slots: TournamentAwardSlotLookupRow[] | null | undefined,
): TournamentAwardSlotLookupRow | undefined {
  return (slots || []).find(
    (candidate) =>
      candidate.tournament_id === tournamentId &&
      placementForTournamentAwardSlot(candidate.slot) === placement,
  );
}

/**
 * Presentation overrides for one granted placement: the per-tournament slot
 * override wins over the live award's own values. Historical grants
 * intentionally re-resolve on every read, so editing a built-in award updates
 * past tournaments too.
 *
 * This resolves the *text* side (the nameplate a card or modal prints).
 * Artwork goes through `awardArtworkDefinitionFor` instead, so that every
 * surface renders the real award definition via AwardArtwork rather than the
 * old procedural AwardBadge cup.
 */
export function resolveAwardArtwork(
  placement: number,
  liveAwardImageUrl: string | null | undefined,
  tournamentId: string | null | undefined,
  slots: TournamentAwardSlotLookupRow[] | null | undefined,
): ResolvedAwardArtwork {
  const slot = slotOverrideFor(placement, tournamentId, slots);
  return {
    image_url: slot?.image_override || liveAwardImageUrl || null,
    custom_name: slot?.custom_name ?? null,
    silhouette: slot?.silhouette_override ?? null,
  };
}

/**
 * Flattens the live award definition behind a placement, plus any
 * per-tournament slot override, into the shape AwardArtwork consumes.
 *
 * Priority per field matches `resolveAwardArtwork`: the tournament's slot
 * override first, then the award's own value. When a tournament has no award
 * occurrence at all (an organizer who never granted awards, so the podium is
 * read off the final stage's standings) a placement-tier definition is
 * synthesized, which AwardArtwork renders as the same plain tier icon every
 * other award without uploaded artwork gets.
 */
export function awardArtworkDefinitionFor(
  placement: number,
  award: AwardDefinitionRow | null | undefined,
  tournamentId: string | null | undefined,
  slots: TournamentAwardSlotLookupRow[] | null | undefined,
): AwardArtworkDefinition {
  const slot = slotOverrideFor(placement, tournamentId, slots);
  const tier = award?.tier || placementToTier(placement);

  return {
    // The id only seeds procedural variation, so a synthesized definition
    // stays stable per tier rather than per tournament.
    id: award?.id || `placement-${placement}`,
    name:
      slot?.custom_name ||
      award?.name ||
      PLACEMENT_AWARD_NAMES[placement] ||
      "Award",
    tier,
    image_url: slot?.image_override || award?.image_url || null,
    silhouette: slot?.silhouette_override ?? award?.silhouette ?? null,
    system_key: award?.system_key ?? null,
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
    award?: AwardDefinitionRow | null;
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
 * -> awards) into the shape AwardCase/AwardModal/TeamsTable consume. `award`
 * carries the artwork definition for AwardArtwork; `trophy_config` carries the
 * nameplate text those components already print. Both are resolved fresh on
 * every read.
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
    award: awardArtworkDefinitionFor(
      placement,
      occurrence?.award,
      occurrence?.tournament_id,
      slots,
    ),
    trophy_config: {
      custom_name: artwork.custom_name,
      silhouette: artwork.silhouette,
      image_url: artwork.image_url,
    },
  };
}
