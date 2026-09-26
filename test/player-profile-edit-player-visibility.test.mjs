import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerProfile = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);
const changeName = await readFile(
  new URL("../components/PlayerChangeName.vue", import.meta.url),
  "utf8",
);
const changeCountry = await readFile(
  new URL("../components/PlayerChangeCountry.vue", import.meta.url),
  "utf8",
);

// canEditPlayer combines several unrelated permissions -- canEditAvatar/
// canEditName (isSelfProfile || isAdmin), canEditCountry (isSelfProfile ||
// match_organizer+), canEditRosterImages (tournament_organizer+) -- so it is
// true for organizers viewing someone else's profile. The Edit Player button
// and Sheet use canOpenEditPlayer: own profile, or Administrator on another
// profile. Moderators and organizers never open it for other players.
test("the Edit Player button is gated by canOpenEditPlayer", () => {
  assert.match(playerProfile, /<button\s*\n\s*v-if="canOpenEditPlayer"/);
});

test("canOpenEditPlayer = canEditPlayer && (isSelfProfile || isAdmin)", () => {
  assert.match(
    playerProfile,
    /canOpenEditPlayer\(\)\s*\{\s*\n\s*return this\.canEditPlayer && \(this\.isSelfProfile \|\| this\.isAdmin\);/,
  );
});

test("isAdmin means the Administrator role specifically (not moderator/organizer)", () => {
  assert.match(
    playerProfile,
    /isAdmin\(\)\s*\{\s*\n\s*return useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.administrator\);/,
  );
});

test("canEditPlayer itself is untouched -- still combines admin/roster permissions for the sheet's own field-level gates", () => {
  assert.match(
    playerProfile,
    /canEditPlayer\(\)\s*\{\s*\n\s*return \(\s*\n\s*this\.canEditAvatar \|\|\s*\n\s*this\.canEditRosterImages \|\|\s*\n\s*this\.canEditName \|\|\s*\n\s*this\.canEditCountry \|\|\s*\n\s*this\.canEditRole\s*\n\s*\);/,
  );
});

test("the Edit Player Sheet can only open through the same gate", () => {
  assert.match(
    playerProfile,
    /<Sheet\s*\n\s*v-if="player"\s*\n\s*:open="editPlayerSheet && canOpenEditPlayer"/,
  );
});

test("an Administrator reaches name, country and avatar for another player", () => {
  assert.match(playerProfile, /canEditAvatar\(\)\s*\{\s*\n\s*return this\.isSelfProfile \|\| this\.isAdmin;/);
  assert.match(playerProfile, /canEditName\(\)\s*\{\s*\n\s*return this\.isSelfProfile \|\| this\.isAdmin;/);
  assert.match(changeName, /isRoleAbove\(e_player_roles_enum\.administrator\)/);
  assert.match(changeCountry, /isRoleAbove\(e_player_roles_enum\.match_organizer\)/);
});

test("isSelfProfile requires both a logged-in viewer and a matching steam_id (false when logged out)", () => {
  assert.match(
    playerProfile,
    /isSelfProfile\(\)\s*\{\s*\n\s*return !!\(\s*\n\s*this\.me &&\s*\n\s*this\.player &&\s*\n\s*this\.player\.steam_id === this\.me\.steam_id\s*\n\s*\);/,
  );
});

test("the administrator webcam-call control on another profile is untouched (still isAdmin && !isSelfProfile, unrelated to Edit Player)", () => {
  assert.match(playerProfile, /v-if="isAdmin && !isSelfProfile"/);
});

// Role matrix, evaluated the same way the page does.
const roleOrder = [
  "user",
  "verified_user",
  "streamer",
  "moderator",
  "match_organizer",
  "tournament_organizer",
  "administrator",
];
const atLeast = (role, min) => roleOrder.indexOf(role) >= roleOrder.indexOf(min);
const canOpen = (role, self) => {
  const isAdmin = atLeast(role, "administrator");
  const canEditPlayer =
    self || isAdmin || atLeast(role, "match_organizer") || atLeast(role, "tournament_organizer");
  return canEditPlayer && (self || isAdmin);
};

test("role matrix: everyone edits self; only Administrator edits others", () => {
  for (const role of roleOrder) {
    assert.equal(canOpen(role, true), true, `${role} self`);
    assert.equal(canOpen(role, false), role === "administrator", `${role} other`);
  }
});
