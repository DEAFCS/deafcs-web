// Canonical values of the e_tournament_categories Hasura enum (see
// generated/zeus's e_tournament_categories_enum), never a translated/display
// label. CategorySelect.vue itself stores and compares these same raw
// values, not the localized description shown next to each button.
export const TOURNAMENT_CATEGORY_LAN = "LAN";
export const TOURNAMENT_CATEGORY_LOCATION_EVENT = "LocationEvent";
export const TOURNAMENT_CATEGORY_ONLINE_EVENT = "OnlineEvent";
export const TOURNAMENT_CATEGORY_LEAGUE = "League";

// Categories that mean the tournament happens at a physical venue and
// therefore need the Location step. Every other category (Online Event,
// League, or no category selected yet) does not.
const LOCATION_REQUIRING_CATEGORIES: readonly string[] = [
  TOURNAMENT_CATEGORY_LAN,
  TOURNAMENT_CATEGORY_LOCATION_EVENT,
];

export function requiresLocation(
  categories: readonly string[] | null | undefined,
): boolean {
  return (categories ?? []).some((category) =>
    LOCATION_REQUIRING_CATEGORIES.includes(category),
  );
}
