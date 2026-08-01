export type AwardArtworkKind =
  | "custom-image"
  | "built-in"
  | "silhouette"
  | "tier-fallback";

export type AwardArtworkSize = "xs" | "sm" | "md" | "hero" | "lg";

export interface AwardArtworkDefinition {
  id: string;
  name: string;
  tier?: string | null;
  image_url?: string | null;
  silhouette?: number | null;
  system_key?: string | null;
}

export interface ResolvedAwardArtwork {
  kind: AwardArtworkKind;
  imageUrl: string | null;
  altText: string;
  placement: 0 | 1 | 2 | 3 | null;
  seed: string;
  silhouette: number | null;
  tier: string;
  tierColor: string;
}

const BUILT_IN_PLACEMENTS: Readonly<Record<string, 0 | 1 | 2 | 3>> = {
  tournament_mvp: 0,
  tournament_gold: 1,
  tournament_silver: 2,
  tournament_bronze: 3,
};

const BUILT_IN_SYSTEM_KEYS: Readonly<Record<0 | 1 | 2 | 3, string>> = {
  0: "tournament_mvp",
  1: "tournament_gold",
  2: "tournament_silver",
  3: "tournament_bronze",
};

export const AWARD_TIER_COLORS: Readonly<Record<string, string>> = {
  mvp: "hsl(195 85% 60%)",
  gold: "hsl(45 95% 60%)",
  silver: "hsl(0 0% 78%)",
  bronze: "hsl(28 70% 52%)",
  special: "hsl(258 90% 74%)",
};

export function placementForAwardTier(
  tier?: string | null,
): 0 | 1 | 2 | 3 | null {
  if (tier === "mvp") return 0;
  if (tier === "gold") return 1;
  if (tier === "silver") return 2;
  if (tier === "bronze") return 3;
  return null;
}

export function placementForBuiltInAward(
  systemKey?: string | null,
): 0 | 1 | 2 | 3 | null {
  if (!systemKey) return null;
  return BUILT_IN_PLACEMENTS[systemKey] ?? null;
}

export function systemKeyForTournamentAwardPlacement(
  placement: number,
): string {
  if (placement === 0 || placement === 1 || placement === 2) {
    return BUILT_IN_SYSTEM_KEYS[placement];
  }
  return BUILT_IN_SYSTEM_KEYS[3];
}

export function resolveAwardImageUrl(
  path: string | null | undefined,
  apiDomain: string | null | undefined,
  defaultCollection: "awards" | "trophies" = "awards",
): string | null {
  if (!path) return null;
  if (/^[a-z][a-z\d+\-.]*:/i.test(path) || path.startsWith("//")) {
    return path;
  }

  const normalizedPath = path.replace(/^\/+/, "");
  const usesKnownEndpoint =
    normalizedPath.startsWith("trophies/") ||
    normalizedPath.startsWith("avatars/awards/");
  const endpoint = usesKnownEndpoint
    ? normalizedPath
    : normalizedPath.startsWith("awards/")
      ? `avatars/awards/${normalizedPath.replace(/^awards\//, "")}`
      : defaultCollection === "trophies"
        ? `trophies/${normalizedPath}`
        : `avatars/awards/${normalizedPath}`;

  if (!apiDomain) return `/${endpoint}`;
  const domain = apiDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${domain}/${endpoint}`;
}

export function resolveAwardArtwork(
  award: AwardArtworkDefinition,
  apiDomain?: string | null,
  options: { ignoreImage?: boolean } = {},
): ResolvedAwardArtwork {
  const tier = award.tier || "special";
  const tierColor = AWARD_TIER_COLORS[tier] || AWARD_TIER_COLORS.special;
  const altText = `${award.name} award artwork`;
  const imageUrl = options.ignoreImage
    ? null
    : resolveAwardImageUrl(award.image_url, apiDomain);

  if (imageUrl) {
    return {
      kind: "custom-image",
      imageUrl,
      altText,
      placement: placementForAwardTier(tier),
      seed: award.id,
      silhouette: null,
      tier,
      tierColor,
    };
  }

  const builtInPlacement = placementForBuiltInAward(award.system_key);
  if (builtInPlacement != null) {
    return {
      kind: "built-in",
      imageUrl: null,
      altText,
      placement: builtInPlacement,
      seed: award.system_key!,
      silhouette: validSilhouette(award.silhouette),
      tier,
      tierColor,
    };
  }

  const tierPlacement = placementForAwardTier(tier);
  const silhouette = validSilhouette(award.silhouette);
  if (silhouette != null && tierPlacement != null) {
    return {
      kind: "silhouette",
      imageUrl: null,
      altText,
      placement: tierPlacement,
      seed: award.id,
      silhouette,
      tier,
      tierColor,
    };
  }

  return {
    kind: "tier-fallback",
    imageUrl: null,
    altText,
    placement: tierPlacement,
    seed: award.id,
    silhouette: null,
    tier,
    tierColor,
  };
}

function validSilhouette(value?: number | null): number | null {
  return value != null && value >= 0 && value <= 4 ? value : null;
}
