import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Reported bug: a doubled/stray separator in the meta strip below the
// nickname, specifically around the role slot ("Steam | Role | Team", or
// "Steam | Team" when role is hidden).
//
// Root cause: PlayerRoleForm.vue's own gate (canChangeRole) was previously
// fixed to require a FIXED viewer-role floor, instead of comparing the
// viewer's role against the VIEWED player's role (see its own comment). But
// the parent page's canEditRole -- which decides both (a) whether the role
// slot's divider renders at all (`v-if="canEditRole || player.role"`) and
// (b) whether to mount the editable <PlayerRoleForm> vs a plain read-only
// chip -- was never updated to match, and kept comparing against the viewed
// player's role.
//
// That mismatch let an "intermediate" viewer (role above the viewed
// player's, but below the floor) satisfy the OUTER gate (mounts
// <PlayerRoleForm>, renders its divider) while PlayerRoleForm's OWN gate
// stayed false (its root <Popover v-if="canChangeRole"> renders nothing) --
// leaving the role's text invisible between two dividers that both still
// rendered, ie. exactly the reported "doubled separator".
//
// Fixed by aligning canEditRole to the same fixed floor as canChangeRole.
// That floor was later tightened to administrator-only by the
// role-permission-boundaries change (platform role assignment, including
// granting the new Moderator role, is an administrator-only action; the
// previous match_organizer+ floor let any match/tournament organizer
// reassign player roles, which was never intended). Both gates were moved
// together, so the doubled-separator fix still holds at the new floor: a
// logged-out viewer, an intermediate-role viewer (streamer/moderator/match
// organizer), and an administrator viewer of the SAME player's profile all
// render a consistent, non-empty role slot (or none at all, if player.role
// is genuinely absent) -- no stray divider in any case.

const playerProfile = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);
const playerRoleForm = await readFile(
  new URL("../components/PlayerRoleForm.vue", import.meta.url),
  "utf8",
);

test("canEditRole uses the same fixed administrator-only floor as PlayerRoleForm's own canChangeRole gate (not the viewed player's role)", () => {
  assert.match(
    playerProfile,
    /canEditRole\(\)\s*\{\s*\n\s*if \(!this\.me \|\| !this\.player \|\| this\.isSelfProfile\) \{\s*\n\s*return false;\s*\n\s*\}\s*\n\s*return useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.administrator\);\s*\n\s*\},/,
  );
  // The specific regression: comparing against the viewed player's own
  // role (this.player.role) instead of the fixed floor.
  assert.doesNotMatch(
    playerProfile,
    /canEditRole\(\)[\s\S]{0,200}isRoleAbove\(this\.player\.role\)/,
  );
});

test("PlayerRoleForm's canChangeRole is still the fixed administrator-only floor this fix mirrors", () => {
  assert.match(
    playerRoleForm,
    /canChangeRole\(\)\s*\{\s*\n\s*return useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.administrator\);\s*\n\s*\},/,
  );
});

test("the role group and its content use the same visibility condition without stray dividers", () => {
  assert.match(
    playerProfile,
    /<template v-if="canEditRole \|\| player\.role">\s*<div\s+v-if="canEditRole"\s+:class="playerHeroInlineRoleWrapClasses"\s*>\s*<PlayerRoleForm :player="player" \/>\s*<\/div>\s*<span v-else :class="playerHeroInlineRoleChipClasses">/,
  );
});

test("role editing keeps its fixed floor and uses the upstream compact role chip", () => {
  assert.match(
    playerProfile,
    /canEditCountry\(\)[\s\S]{0,200}isRoleAbove\(e_player_roles_enum.match_organizer\)/,
  );
  assert.match(
    playerProfile,
    /rounded-md border border-border bg-card\/60 px-2.5/,
  );
});
