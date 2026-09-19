import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerProfile = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);

// Root cause: canEditPlayer combines several unrelated permissions --
// canEditAvatar/canEditName (isSelfProfile || isAdmin), canEditCountry
// (isSelfProfile || match_organizer+), canEditRosterImages
// (tournament_organizer+) -- so it evaluates true for an admin/moderator/
// organizer viewing SOMEONE ELSE's profile, which made the Player Card's
// Edit Player button (and its Sheet) show up on other players' profiles.
// canEditPlayer itself must stay untouched (it still gates which fields the
// sheet shows once opened, and is the basis for other admin tooling), so
// the fix only adds an isSelfProfile requirement at the two places this
// specific profile-card control can show/open the sheet.
test("the Player Card's Edit Player button additionally requires isSelfProfile (not just canEditPlayer)", () => {
  assert.match(
    playerProfile,
    /<button\s*\n\s*v-if="canEditPlayer && isSelfProfile"/,
  );
});

test("canEditPlayer itself is untouched -- still combines admin/roster permissions for the sheet's own field-level gates", () => {
  assert.match(
    playerProfile,
    /canEditPlayer\(\)\s*\{\s*\n\s*return \(\s*\n\s*this\.canEditAvatar \|\|\s*\n\s*this\.canEditRosterImages \|\|\s*\n\s*this\.canEditName \|\|\s*\n\s*this\.canEditCountry \|\|\s*\n\s*this\.canEditRole\s*\n\s*\);/,
  );
});

test("the Edit Player Sheet cannot be forced open on another profile through this control", () => {
  assert.match(
    playerProfile,
    /<Sheet\s*\n\s*v-if="player"\s*\n\s*:open="editPlayerSheet && isSelfProfile"/,
  );
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
