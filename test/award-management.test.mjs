import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  awardDefinitionDraft,
  awardIdentityLocked,
  awardImageIntent,
  awardSaveVariables,
  emptyAwardDefinitionDraft,
  validateAwardDefinition,
} from "../utilities/awardManagement.ts";

const catalog = await readFile(
  new URL("../pages/awards/index.vue", import.meta.url),
  "utf8",
);
const detail = await readFile(
  new URL("../pages/awards/[id].vue", import.meta.url),
  "utf8",
);
const manage = await readFile(
  new URL("../pages/awards/manage.vue", import.meta.url),
  "utf8",
);
const middleware = await readFile(
  new URL("../middleware/award-management.ts", import.meta.url),
  "utf8",
);
const settingsStore = await readFile(
  new URL("../stores/ApplicationSettings.ts", import.meta.url),
  "utf8",
);
const imageUpload = await readFile(
  new URL("../components/ImageUploadTile.vue", import.meta.url),
  "utf8",
);

test("authorized staff see Manage Awards while public users do not", () => {
  assert.match(catalog, /const canManageAwards = computed/);
  assert.match(catalog, /<template v-if="canManageAwards" #actions>/);
  assert.match(catalog, /to="\/awards\/manage"/);
  assert.match(settingsStore, /public\.create_awards_role/);
  assert.match(
    settingsStore,
    /canManageSharedAwards[\s\S]*isRoleAbove\(awardCreateRole\.value\)[\s\S]*isRoleAbove\(e_player_roles_enum\.administrator\)/,
  );
});

test("unauthorized direct management access is redirected safely", () => {
  assert.match(manage, /middleware: "award-management"/);
  assert.match(middleware, /!useApplicationSettingsStore\(\)\.canManageSharedAwards/);
  assert.match(middleware, /navigateTo\("\/awards", \{ replace: true \}\)/);
});

test("create builds one reusable saveAward definition", () => {
  const draft = {
    ...emptyAwardDefinitionDraft(),
    name: "2v2 Cup Champion",
    description: "Reusable champion definition",
    tier: "gold",
    repeatable: true,
  };
  assert.deepEqual(awardSaveVariables(draft), {
    id: null,
    name: "2v2 Cup Champion",
    description: "Reusable champion definition",
    tier: "gold",
    silhouette: null,
    allow_multiple: true,
    tournament_id: null,
    event_id: null,
    elo_season_id: null,
    league_season_id: null,
  });
  assert.match(manage, /mutation SaveAwardDefinition/);
  assert.match(manage, /saveAward\(/);
  assert.doesNotMatch(manage, /grantAward|setTournamentAward|recipient_type/);
});

test("editing preserves supported fields that are not exposed by the form", () => {
  const existing = {
    id: "award-1",
    name: "Old name",
    description: "Old description",
    tier: "silver",
    silhouette: 3,
    allow_multiple: false,
    event_id: "event-1",
  };
  const draft = awardDefinitionDraft(existing);
  draft.name = "Updated name";
  const variables = awardSaveVariables(draft, existing);
  assert.equal(variables.id, "award-1");
  assert.equal(variables.name, "Updated name");
  assert.equal(variables.silhouette, 3);
  assert.equal(variables.event_id, "event-1");
  assert.equal(variables.tournament_id, null);
});

test("image workflow preserves, replaces, and removes artwork explicitly", () => {
  assert.equal(awardImageIntent(null, false), "preserve");
  assert.equal(awardImageIntent(new Blob(["image"]), false), "upload");
  assert.equal(awardImageIntent(null, true), "remove");
  assert.match(manage, /imageIntent === "upload"[\s\S]*uploadAwardImage/);
  assert.match(manage, /imageIntent === "remove"[\s\S]*removeAwardArtwork/);
  assert.match(manage, /method: "POST", credentials: "include", body: formData/);
  assert.match(manage, /method: "DELETE", credentials: "include"/);
  assert.match(manage, /\/avatars\/awards\/\$\{awardId\}/);
  assert.match(imageUpload, /imageAlt\?: string/);
  assert.match(
    imageUpload,
    /props\.mode === "deferred"[\s\S]*!!deferredPreview\.value \|\| props\.hasCustom/,
  );
});

test("archive and unarchive use archiveAward without deleting history", () => {
  assert.match(manage, /mutation ArchiveAwardDefinition/);
  assert.match(manage, /archiveAward\(id: \$id, archived: \$archived\)/);
  assert.match(manage, /const archived = !target\.archived_at/);
  assert.match(manage, /Historical[\s\S]*occurrences and recipients will be preserved/);
  assert.doesNotMatch(manage, /deleteAward/);
});

test("built-in and historical identity restrictions are represented", () => {
  assert.equal(awardIdentityLocked({ id: "built-in", name: "Built in", tier: "gold", system_key: "tournament_gold" }), true);
  assert.equal(
    awardIdentityLocked({
      id: "used",
      name: "Used",
      tier: "special",
      occurrences_aggregate: { aggregate: { count: 1 } },
    }),
    true,
  );
  assert.equal(awardIdentityLocked({ id: "custom", name: "Custom", tier: "special" }), false);
  assert.match(manage, /:disabled="!!award\.system_key"/);
  assert.match(manage, /Built-in awards cannot be archived/);
  assert.match(manage, /:disabled="identityLocked"/);
});

test("validation rejects missing names and scoped definitions without an owner", () => {
  assert.deepEqual(validateAwardDefinition(emptyAwardDefinitionDraft()), {
    name: "Award name is required.",
  });
  assert.deepEqual(
    validateAwardDefinition({
      ...emptyAwardDefinitionDraft(),
      name: "Scoped",
      scope: "tournament",
    }),
    { scopeId: "Choose the definition that owns this award." },
  );
});

test("public award catalog and detail routes retain their read-only contracts", () => {
  assert.match(catalog, /query PublicAwardCatalog/);
  assert.match(catalog, /archived_at: \{ _is_null: true \}/);
  assert.match(detail, /query PublicAwardDetail/);
  assert.match(detail, /awards_by_pk\(id: \$id\)/);
  assert.doesNotMatch(detail, /saveAward|archiveAward/);
});
