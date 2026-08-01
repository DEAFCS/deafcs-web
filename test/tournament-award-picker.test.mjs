import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  awardsForTournamentPlacement,
  effectiveTournamentAwardSelection,
  eligibleTournamentAward,
  tournamentAwardSelectionOverrides,
  tournamentMvpEnabled,
} from "../utilities/tournamentAwardPicker.ts";

const picker = await readFile(
  new URL(
    "../components/tournament/TournamentAwardPicker.vue",
    import.meta.url,
  ),
  "utf8",
);
const manualAwards = await readFile(
  new URL(
    "../components/tournament/TournamentAwardsManage.vue",
    import.meta.url,
  ),
  "utf8",
);
const detail = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const wizard = await readFile(
  new URL(
    "../components/tournament/TournamentCreateWizard.vue",
    import.meta.url,
  ),
  "utf8",
);
const legacyAwardConfig = new URL(
  "../components/tournament/TournamentAwardsConfig.vue",
  import.meta.url,
);
const legacyTrophyConfig = new URL(
  "../components/tournament/TournamentTrophiesConfig.vue",
  import.meta.url,
);

const awards = [
  {
    id: "builtin-gold",
    name: "Tournament Champion",
    tier: "gold",
    system_key: "tournament_gold",
  },
  {
    id: "builtin-silver",
    name: "Tournament Runner-Up",
    tier: "silver",
    system_key: "tournament_silver",
  },
  {
    id: "builtin-bronze",
    name: "Tournament Third Place",
    tier: "bronze",
    system_key: "tournament_bronze",
  },
  {
    id: "builtin-mvp",
    name: "Tournament MVP",
    tier: "mvp",
    system_key: "tournament_mvp",
  },
  {
    id: "reusable-gold",
    name: "2v2 Cup Champion",
    tier: "gold",
  },
  {
    id: "owned-gold",
    name: "Owned Champion",
    tier: "gold",
    tournament_id: "tournament-1",
  },
  {
    id: "foreign-gold",
    name: "Foreign Champion",
    tier: "gold",
    tournament_id: "tournament-2",
  },
  {
    id: "event-gold",
    name: "Event Champion",
    tier: "gold",
    event_id: "event-1",
  },
  {
    id: "archived-gold",
    name: "Archived Champion",
    tier: "gold",
    archived_at: "2026-01-01T00:00:00Z",
  },
];

test("organizers see the picker in the existing Trophies tab", () => {
  assert.match(detail, /value="trophies" v-if="tournament\?\.is_organizer"/);
  assert.match(detail, /<TournamentAwardPicker[\s\S]*v-model="tournamentAwardSelection"/);
  assert.match(detail, /:tournament-id="tournament\.id"/);
  assert.match(detail, /:match-type="tournament\.options\?\.type \|\| null"/);
  assert.match(detail, /:min-players-per-lineup="tournament\.min_players_per_lineup \?\? null"/);
});

test("legacy automatic placement override editors and cards are removed", () => {
  assert.equal(existsSync(legacyAwardConfig), false);
  assert.equal(existsSync(legacyTrophyConfig), false);
  assert.doesNotMatch(detail, /TournamentAwardsConfig|TournamentTrophiesConfig/);
  assert.doesNotMatch(detail, /v-for="p in placements"/);
  assert.doesNotMatch(detail, /trophies_enabled|toggleEnabled|savingEnabled/);
  assert.doesNotMatch(detail, /Trophy Configuration|automatic trophy appearance/i);
});

test("automatic placement image, name, silhouette, and individual controls are absent", () => {
  const activeAutomaticUi = `${detail}\n${picker}`;
  assert.doesNotMatch(activeAutomaticUi, /ImageUploadTile|:upload-url|uploadUrl\(/);
  assert.doesNotMatch(activeAutomaticUi, /v-model="drafts\[p\]\.custom_name"/);
  assert.doesNotMatch(activeAutomaticUi, /SILHOUETTE_OPTIONS|silhouetteOptions/);
  assert.doesNotMatch(activeAutomaticUi, /resetDraft|save\(p as|saving\[p\]/);
  assert.doesNotMatch(
    activeAutomaticUi,
    /(?:insert|update|delete)_tournament_trophy_configs/,
  );
  assert.match(picker, /Reset all to defaults/);
  assert.match(picker, /Save award mappings/);
});

test("Manual Awards remains mounted with its add and revoke workflows", () => {
  assert.match(detail, /<TournamentAwardsManage :tournament="tournament"/);
  assert.match(manualAwards, /tournament\.trophies_manage\.manual_awards/);
  assert.match(manualAwards, /insert_tournament_trophies_one/);
  assert.match(manualAwards, /revokeAward\(id: \$id, reason: \$reason\)/);
});

test("existing slots load and missing slots use explicit built-in defaults", () => {
  assert.deepEqual(
    effectiveTournamentAwardSelection(awards, [
      {
        slot: "champion",
        award_id: "reusable-gold",
      },
    ]),
    {
      0: "builtin-mvp",
      1: "reusable-gold",
      2: "builtin-silver",
      3: "builtin-bronze",
    },
  );
  assert.match(picker, /query TournamentAwardPickerSlots/);
  assert.match(picker, /tournament_award_slots/);
});

test("tier and backend-equivalent eligibility filtering are enforced", () => {
  assert.equal(eligibleTournamentAward(awards[4], "tournament-1"), true);
  assert.equal(eligibleTournamentAward(awards[5], "tournament-1"), true);
  assert.equal(eligibleTournamentAward(awards[6], "tournament-1"), false);
  assert.equal(eligibleTournamentAward(awards[7], "tournament-1"), false);
  assert.equal(eligibleTournamentAward(awards[8], "tournament-1"), false);

  assert.deepEqual(
    awardsForTournamentPlacement(awards, 1, "tournament-1").map(
      (award) => award.id,
    ),
    ["builtin-gold", "reusable-gold", "owned-gold"],
  );
  assert.deepEqual(
    awardsForTournamentPlacement(awards, 2, "tournament-1").map(
      (award) => award.id,
    ),
    ["builtin-silver"],
  );
});

test("the same reusable definition is eligible for different tournaments", () => {
  assert.equal(eligibleTournamentAward(awards[4], "tournament-1"), true);
  assert.equal(eligibleTournamentAward(awards[4], "tournament-2"), true);
});

test("reset and save submit explicit IDs while preserving presentation overrides", () => {
  assert.match(picker, /mutation SetTournamentAwardPickerSlot/);
  assert.match(picker, /award_id: \$awardId/);
  assert.doesNotMatch(picker, /award_id:\s*null/);
  assert.match(
    picker,
    /customName: existing\?\.custom_name \?\? null,[\s\S]*silhouette: existing\?\.silhouette_override \?\? null/,
  );
  assert.match(picker, /Explicit IDs are intentional: null can resolve to the existing override/);
  assert.match(picker, /image_override/);
});

test("finished tournament mappings are visible but locked", () => {
  assert.match(detail, /:finished="tournament\.status === 'Finished'"/);
  assert.match(
    picker,
    /Award mappings cannot be changed after completion because existing award[\s\S]*occurrences are not automatically recalculated\./,
  );
  assert.match(picker, /:disabled="finished \|\| saving"/);
  assert.match(picker, /if \(!props\.tournamentId \|\| saving\.value \|\| props\.finished/);
});

test("MVP follows the existing tournament mode rules", () => {
  assert.equal(tournamentMvpEnabled("Duel"), false);
  assert.equal(tournamentMvpEnabled("Wingman"), false);
  assert.equal(tournamentMvpEnabled("Competitive"), true);
  assert.equal(tournamentMvpEnabled(null, 1), false);
  assert.equal(tournamentMvpEnabled(null, 2), false);
  assert.equal(tournamentMvpEnabled(null, 5), true);
  assert.match(picker, /MVP is disabled for this tournament mode\./);
  assert.match(
    picker,
    /config\.placement !== 0 \|\| mvpEnabled/,
  );
});

test("creation persists only non-default enabled mappings", () => {
  assert.deepEqual(
    tournamentAwardSelectionOverrides(
      {
        0: "builtin-mvp",
        1: "builtin-gold",
        2: "builtin-silver",
        3: "builtin-bronze",
      },
      awards,
      false,
    ),
    [],
  );
  assert.deepEqual(
    tournamentAwardSelectionOverrides(
      {
        0: "reusable-mvp",
        1: "reusable-gold",
        2: "builtin-silver",
        3: "builtin-bronze",
      },
      awards,
      false,
    ),
    [{ placement: 1, awardId: "reusable-gold" }],
  );
  assert.match(wizard, /\{ key: "prizes"[\s\S]*\{ key: "awards"/);
  assert.match(wizard, /v-model="awardSelections"/);
  assert.match(
    wizard,
    /const tournamentId = data\.insert_tournaments_one\.id;[\s\S]*persistTournamentAwardSelections\(tournamentId\)/,
  );
  assert.match(wizard, /picker\.persistSelections\(tournamentId, true\)/);
});

test("partial creation failures direct organizers to recovery without recreating the tournament", () => {
  assert.match(
    wizard,
    /Tournament created, but award mappings need attention/,
  );
  assert.match(wizard, /Some selections may already have been saved/);
  assert.match(wizard, /awardMappingsFailed \? \{ tab: "trophies" \}/);
});

test("the picker does not create occurrences, recipients, or definitions", () => {
  assert.doesNotMatch(
    picker,
    /saveAward|grantAward|award_occurrences|award_recipients|calculate_tournament_awards/,
  );
});
