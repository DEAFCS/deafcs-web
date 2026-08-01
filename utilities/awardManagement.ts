import { AWARD_TIERS, type AwardTier } from "./awardCatalog.ts";

export const AWARD_MANAGEMENT_SCOPES = [
  "global",
  "tournament",
  "event",
  "elo_season",
  "league_season",
] as const;

export type AwardManagementScope = (typeof AWARD_MANAGEMENT_SCOPES)[number];

export interface AwardDefinitionDraft {
  name: string;
  description: string;
  tier: AwardTier;
  repeatable: boolean;
  scope: AwardManagementScope;
  scopeId: string;
}

export interface ManagedAwardDefinition {
  id: string;
  name: string;
  description?: string | null;
  tier: string;
  silhouette?: number | null;
  image_url?: string | null;
  system_key?: string | null;
  allow_multiple?: boolean | null;
  archived_at?: string | null;
  tournament_id?: string | null;
  event_id?: string | null;
  elo_season_id?: string | null;
  league_season_id?: string | null;
  occurrences_aggregate?: {
    aggregate?: { count?: number | null } | null;
  } | null;
}

export type AwardValidationErrors = Partial<
  Record<"name" | "tier" | "scope", string>
>;

export type AwardImageIntent = "preserve" | "upload" | "remove";

export function emptyAwardDefinitionDraft(): AwardDefinitionDraft {
  return {
    name: "",
    description: "",
    tier: "special",
    repeatable: false,
    scope: "global",
    scopeId: "",
  };
}

export function awardDefinitionScope(
  award: ManagedAwardDefinition,
): { scope: AwardManagementScope; scopeId: string } {
  if (award.tournament_id) {
    return { scope: "tournament", scopeId: award.tournament_id };
  }
  if (award.event_id) {
    return { scope: "event", scopeId: award.event_id };
  }
  if (award.elo_season_id) {
    return { scope: "elo_season", scopeId: award.elo_season_id };
  }
  if (award.league_season_id) {
    return { scope: "league_season", scopeId: award.league_season_id };
  }
  return { scope: "global", scopeId: "" };
}

export function awardDefinitionDraft(
  award: ManagedAwardDefinition,
): AwardDefinitionDraft {
  const scope = awardDefinitionScope(award);
  return {
    name: award.name,
    description: award.description || "",
    tier: AWARD_TIERS.includes(award.tier as AwardTier)
      ? (award.tier as AwardTier)
      : "special",
    repeatable: !!award.allow_multiple,
    scope: scope.scope,
    scopeId: scope.scopeId,
  };
}

export function validateAwardDefinition(
  draft: AwardDefinitionDraft,
): AwardValidationErrors {
  const errors: AwardValidationErrors = {};
  if (!draft.name.trim()) {
    errors.name = "Award name is required.";
  }
  if (!AWARD_TIERS.includes(draft.tier)) {
    errors.tier = "Choose a supported award tier.";
  }
  if (!AWARD_MANAGEMENT_SCOPES.includes(draft.scope)) {
    errors.scope = "Choose an award scope.";
  }
  return errors;
}

export function awardSaveVariables(
  draft: AwardDefinitionDraft,
  existing?: ManagedAwardDefinition | null,
) {
  return {
    id: existing?.id || null,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    tier: draft.tier,
    // Silhouette is supported by saveAward but is not part of this form. Keep
    // the current value on edit instead of accidentally clearing it.
    silhouette: existing?.silhouette ?? null,
    allow_multiple: draft.repeatable,
    tournament_id:
      draft.scope === "tournament" ? draft.scopeId || null : null,
    event_id: draft.scope === "event" ? draft.scopeId || null : null,
    elo_season_id:
      draft.scope === "elo_season" ? draft.scopeId || null : null,
    league_season_id:
      draft.scope === "league_season" ? draft.scopeId || null : null,
  };
}

export function awardIdentityLocked(award?: ManagedAwardDefinition | null) {
  return (
    !!award?.system_key ||
    (award?.occurrences_aggregate?.aggregate?.count || 0) > 0
  );
}

export function awardImageIntent(
  pendingImage: Blob | null,
  removeImage: boolean,
): AwardImageIntent {
  if (pendingImage) return "upload";
  if (removeImage) return "remove";
  return "preserve";
}
