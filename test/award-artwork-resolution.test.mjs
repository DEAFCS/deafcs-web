import assert from "node:assert/strict";
import { register } from "node:module";

register("./resolve-aliases-loader.mjs", import.meta.url);

const {
  resolveAwardArtwork,
  awardArtworkDefinitionFor,
  mapAwardRecipientToTrophy,
} = await import("~/utilities/awardOccurrenceResolution");
const { resolveAwardArtwork: resolveArtworkForDefinition } = await import(
  "~/utilities/awardArtwork"
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

// Live awards.image_url is used whenever present, leaving null only when both
// it and the slot override are absent.
{
  const withImage = resolveAwardArtwork(2, "https://cdn.example/silver.png", "t1", []);
  assert.equal(withImage.image_url, "https://cdn.example/silver.png");

  const withoutImage = resolveAwardArtwork(2, null, "t1", []);
  assert.equal(withoutImage.image_url, null);
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

// --- awardArtworkDefinitionFor -------------------------------------------
//
// The artwork side of the same resolution. Every placement surface renders
// this through AwardArtwork, so what it returns decides whether a viewer sees
// the real award (and its uploaded artwork) or a generic tier icon.

// The granted award is carried through whole, not reduced to an image.
{
  const definition = awardArtworkDefinitionFor(
    1,
    {
      id: "award-1",
      name: "Winter Cup Champion",
      tier: "gold",
      silhouette: 2,
      image_url: "https://cdn.example/gold.png",
      system_key: null,
    },
    "t1",
    [],
  );
  assert.equal(definition.id, "award-1");
  assert.equal(definition.name, "Winter Cup Champion");
  assert.equal(definition.tier, "gold");
  assert.equal(definition.silhouette, 2);
  assert.equal(definition.image_url, "https://cdn.example/gold.png");
  // ...and AwardArtwork renders the uploaded image rather than a cup.
  assert.equal(resolveArtworkForDefinition(definition).kind, "custom-image");
}

// Every slot override still outranks the live award, field by field.
{
  const definition = awardArtworkDefinitionFor(
    1,
    {
      id: "award-1",
      name: "Champion",
      tier: "gold",
      silhouette: 2,
      image_url: "https://cdn.example/gold.png",
    },
    "t1",
    [
      {
        tournament_id: "t1",
        slot: "champion",
        custom_name: "Founders Cup",
        silhouette_override: 4,
        image_override: "https://cdn.example/custom.png",
      },
    ],
  );
  assert.equal(definition.name, "Founders Cup");
  assert.equal(definition.silhouette, 4);
  assert.equal(definition.image_url, "https://cdn.example/custom.png");
}

// A silhouette override of 0 is a real choice, not "unset".
{
  const definition = awardArtworkDefinitionFor(
    1,
    { id: "award-1", name: "Champion", tier: "gold", silhouette: 3 },
    "t1",
    [{ tournament_id: "t1", slot: "champion", silhouette_override: 0 }],
  );
  assert.equal(definition.silhouette, 0);
}

// Another tournament's slot must never leak in.
{
  const definition = awardArtworkDefinitionFor(
    1,
    { id: "award-1", name: "Champion", tier: "gold" },
    "t1",
    [{ tournament_id: "t2", slot: "champion", custom_name: "Wrong" }],
  );
  assert.equal(definition.name, "Champion");
}

// No occurrence at all (an organizer who never granted awards, so the podium
// is read off the final stage's standings): a placement-tier definition is
// synthesized, and AwardArtwork renders the same plain tier icon every other
// award without uploaded artwork gets -- not a procedural cup.
{
  for (const [placement, tier] of [
    [0, "mvp"],
    [1, "gold"],
    [2, "silver"],
    [3, "bronze"],
  ]) {
    const definition = awardArtworkDefinitionFor(placement, null, "t1", []);
    assert.equal(definition.tier, tier);
    assert.ok(definition.id, "a synthesized definition still needs a seed id");
    assert.ok(definition.name, "a synthesized definition still needs a name");
    assert.equal(definition.image_url, null);
    assert.equal(resolveArtworkForDefinition(definition).kind, "tier-fallback");
  }
}

// mapAwardRecipientToTrophy flattens a live award_recipients row into the
// shape AwardCase/AwardModal/TeamsTable consume: `award` drives AwardArtwork,
// `trophy_config` still drives the nameplate text those components print.
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
      award: {
        id: "award-1",
        name: "Champion",
        tier: "gold",
        silhouette: null,
        image_url: "https://cdn.example/gold.png",
        system_key: "tournament_gold",
      },
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
  assert.equal(mapped.award.id, "award-1");
  assert.equal(mapped.award.name, "Champion");
  assert.equal(mapped.award.tier, "gold");
  assert.equal(mapped.award.system_key, "tournament_gold");
  assert.equal(resolveArtworkForDefinition(mapped.award).kind, "custom-image");
}

console.log("award artwork resolution checks passed");
