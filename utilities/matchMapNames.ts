import cleanMapName from "./cleanMapName";

interface MatchMapLike {
  map?: {
    name?: string | null;
    label?: string | null;
  } | null;
}

// Joins every currently-known match_maps entry's cleaned name with " · ",
// matching MatchTableRow.vue's own map-list rendering on /watch exactly:
// same cleanMapName call, same separator, same reliance on the array's
// existing query order (callers already select match_maps with
// order_by: [{ order: order_by.asc }]). A match with only some maps known
// (mid-veto) simply has a shorter array -- nothing here invents
// placeholders for maps that aren't known yet.
export function joinedMapNames(
  matchMaps: MatchMapLike[] | null | undefined,
): string {
  return (matchMaps ?? [])
    .map((matchMap) =>
      cleanMapName(matchMap.map?.label || matchMap.map?.name || ""),
    )
    .filter(Boolean)
    .join(" · ");
}
