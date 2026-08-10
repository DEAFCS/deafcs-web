import assert from "node:assert/strict";
import { register } from "node:module";

register("./resolve-aliases-loader.mjs", import.meta.url);

const { resolveAwardArtwork, mapAwardRecipientToTrophy } = await import(
  "~/utilities/awardOccurrenceResolution"
);
const { placementForTournamentAwardSlot } = await import(
  "~/utilities/tournamentAwardPicker"
);

// Explicit slot <-> placement mapping.
assert.equal(placementForTournamentAwardSlot("mvp"), 0);
assert.equal(placementForTournamentAwardSlot("champion"), 1);
assert.equal(placementForTournamentAwardSlot("runner_up"), 2);
assert.equal(placementForTournamentAwardSlot("third_place"), 3);

// A built-in award's image update must reflect on historical grants: the
// resolver always reads the live award image, never a stored snapshot.
{
  const artwork = resolveAwardArtwork(1, "https://cdn.example/new-gold.png", "t1", []);
  assert.equal(artwork.image_url, "https://cdn.example/new-gold.png");
}

// tournament_award_slots.image_override outranks the live award image.
{
  const artwork = resolveAwardArtwork(1, "https://cdn.example/new-gold.png", "t1", [
    { tournament_id: "t1", slot: "champion", image_override: "https://cdn.example/custom.png" },
  ]);
  assert.equal(artwork.image_url, "https://cdn.example/custom.png");
}

// Live awards.image_url wins over the AwardBadge generated fallback (i.e. is
// used whenever present, leaving null/fallback only when both are absent).
{
  const withImage = resolveAwardArtwork(2, "https://cdn.example/silver.png", "t1", []);
  assert.equal(withImage.image_url, "https://cdn.example/silver.png");

  const withoutImage = resolveAwardArtwork(2, null, "t1", []);
  assert.equal(withoutImage.image_url, null); // caller (AwardBadge) falls back to generated art
}

// Slot lookups are scoped by tournament_id — a slot from a different
// tournament must never leak into another tournament's resolution.
{
  const artwork = resolveAwardArtwork(1, "https://cdn.example/gold.png", "t1", [
    { tournament_id: "t2", slot: "champion", image_override: "https://cdn.example/wrong-tournament.png" },
  ]);
  assert.equal(artwork.image_url, "https://cdn.example/gold.png");
}

// All four slot/placement mappings resolve correctly end-to-end through the
// override lookup used by the podium/team/player surfaces.
{
  const slots = [
    { tournament_id: "t1", slot: "mvp", image_override: "mvp.png" },
    { tournament_id: "t1", slot: "champion", image_override: "champion.png" },
    { tournament_id: "t1", slot: "runner_up", image_override: "runner_up.png" },
    { tournament_id: "t1", slot: "third_place", image_override: "third_place.png" },
  ];
  assert.equal(resolveAwardArtwork(0, null, "t1", slots).image_url, "mvp.png");
  assert.equal(resolveAwardArtwork(1, null, "t1", slots).image_url, "champion.png");
  assert.equal(resolveAwardArtwork(2, null, "t1", slots).image_url, "runner_up.png");
  assert.equal(resolveAwardArtwork(3, null, "t1", slots).image_url, "third_place.png");
}

// mapAwardRecipientToTrophy flattens a live award_recipients row into the
// legacy Award shape AwardCase/AwardModal already consume, without those
// components needing to change.
{
  const recipient = {
    id: "recip-1",
    team_id: "team-1",
    player_steam_id: null,
    tournament_team_id: "tt-1",
    occurrence: {
      id: "occ-1",
      tournament_id: "t1",
      placement: 1,
      award: { image_url: "https://cdn.example/gold.png" },
      tournament: { name: "Cup", start: "2026-01-01" },
    },
    tournament_team: { name: "Squad", team_id: "team-1", team: { id: "team-1", name: "Squad" } },
    team: { id: "team-1", name: "Squad" },
  };
  const mapped = mapAwardRecipientToTrophy(recipient, []);
  assert.equal(mapped.trophy_config.image_url, "https://cdn.example/gold.png");
  assert.equal(mapped.placement, 1);
  assert.equal(mapped.tournament_id, "t1");
  assert.equal(mapped.team_id, "team-1");
}

console.log("award artwork resolution checks passed");
