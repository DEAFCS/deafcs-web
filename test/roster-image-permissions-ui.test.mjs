import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

// The GENERAL player roster image is self-service again (matches upstream
// 5Stack): any signed-in player on their own profile, or an Administrator on
// anyone else's. Team-specific roster images stay tournament_organizer+ in the
// web UI (below). Normal avatar editing is untouched.
{
  const src = await read("pages/players/[id].vue");

  // canEditAvatar remains self-or-administrator; the roster rule reuses it, so
  // normal users, Verified Users and Administrators behave like the avatar.
  assert.match(
    src,
    /canEditAvatar\(\)\s*\{\s*return this\.isSelfProfile \|\| this\.isAdmin;\s*\}/,
  );
  assert.match(
    src,
    /canEditRosterImages\(\)\s*\{\s*return this\.canEditAvatar;\s*\}/,
    "general roster image editing must be self-or-administrator, same as the avatar",
  );
  assert.doesNotMatch(
    src,
    /canEditRosterImages\(\)\s*\{[^}]*tournament_organizer/,
    "general roster image editing must not require tournament_organizer",
  );

  // Exactly one personal roster editor, gated on the roster rule.
  assert.equal(
    (src.match(/kind="roster"/g) ?? []).length,
    1,
    "only one roster image editor may exist on the profile",
  );
  assert.match(
    src,
    /v-if="canEditRosterImages"[\s\S]{0,400}avatar\.player_roster_image/,
  );

  // The Edit Player sheet still only opens for self or Administrator, so
  // other users (including Verified Users) never reach another player's tile.
  assert.match(
    src,
    /canOpenEditPlayer\(\)\s*\{\s*return this\.canEditPlayer && \(this\.isSelfProfile \|\| this\.isAdmin\);/,
  );

  // Help text links straight to the Tournament Rules roster section, once,
  // directly under the roster tile (not the avatar tile).
  assert.match(src, /keypath="avatar\.roster_rules_hint"/);
  assert.match(src, /<NuxtLink\s+to="\/tournament-rules#roster-images"/);
  assert.equal(
    (src.match(/avatar\.roster_rules_hint/g) ?? []).length,
    1,
    "rules link appears once, beside the roster editor only",
  );
  const hintIdx = src.indexOf("avatar.roster_rules_hint");
  assert.ok(hintIdx > src.indexOf('kind="roster"'));
  assert.ok(hintIdx < src.indexOf('v-if="canEditName"'));

  // bulkApplyTeams (team-specific writes) stays staff-only.
  const bulkMatch = src.match(/bulkApplyTeams\(\)\s*\{([\s\S]*?)\n {4}\},/);
  assert.ok(bulkMatch, "bulkApplyTeams computed not found");
  assert.match(bulkMatch[1], /canBulkApplyTeamRosterImages/);
  assert.match(
    src,
    /canBulkApplyTeamRosterImages\(\)\s*\{\s*return useAuthStore\(\)\.isRoleAbove\(\s*e_player_roles_enum\.tournament_organizer,?\s*\);?\s*\}/,
  );
  assert.doesNotMatch(
    bulkMatch[1],
    /owner_steam_id|viewer_roster|e_team_roles_enum\.Admin/,
  );

  const en = JSON.parse(await read("i18n/locales/en.json"));
  assert.match(en.avatar.roster_rules_hint, /tournament lineups/i);
  assert.match(en.avatar.roster_rules_hint, /\{link\}/);
  assert.ok(!en.avatar.roster_rules_hint.includes("—"));
}

{
  const src = await read("components/teams/TeamMember.vue");

  // Team-specific roster images are a separate feature from the profile's
  // general image: invites never edit, site staff (tournament_organizer+) and
  // team managers (team.can_change_role) can, as the API's
  // assertTeamRosterEditor allows. Unchanged by the self-service restore.
  const body = src.match(/canEditRosterImage\(\): boolean \{([\s\S]*?)\n {4}\},/);
  assert.ok(body, "canEditRosterImage computed not found");
  assert.match(body[1], /this\.isInvite/);
  assert.match(body[1], /isRoleAbove\(e_player_roles_enum\.tournament_organizer\)/);
  assert.match(body[1], /this\.team\.can_change_role/);

  // team.can_change_role must still exist and still gate the OTHER menu
  // actions (role assignment, remove member, set captain).
  assert.match(src, /team\.can_change_role && roles\?\.length/);
  assert.match(src, /team\.can_change_role && canRemoveMember/);
  assert.match(src, /canSetCaptain\(\): boolean \{\s*return !!\(this\.team\.can_change_role/);
}

console.log("roster image frontend permission checks passed");
