import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

// Roster images (general + team-specific) are Administrator/Tournament
// Organizer only - self-service (by the player, team owner, or team Admin)
// was intentionally removed. Normal avatar editing is untouched.
{
  const src = await read("pages/players/[id].vue");

  assert.match(
    src,
    /canEditRosterImages\(\)\s*\{\s*return useAuthStore\(\)\.isRoleAbove\(\s*e_player_roles_enum\.tournament_organizer,?\s*\);?\s*\}/,
    "general roster image editing must require isRoleAbove(tournament_organizer)",
  );

  // canEditAvatar must remain self-or-administrator (untouched avatar rule).
  assert.match(
    src,
    /canEditAvatar\(\)\s*\{\s*return this\.isSelfProfile \|\| this\.isAdmin;\s*\}/,
  );

  // The roster-image upload tile must gate on the new, stricter check - not
  // the avatar rule (which still allows self-service).
  assert.match(src, /v-if="canEditRosterImages"[\s\S]{0,400}avatar\.player_roster_image/);

  // bulkApplyTeams (the "apply to these teams" picker) must also require
  // tournament_organizer+ and must no longer allow team-owner/team-Admin
  // self-service.
  const bulkMatch = src.match(/bulkApplyTeams\(\)\s*\{([\s\S]*?)\n {4}\},/);
  assert.ok(bulkMatch, "bulkApplyTeams computed not found");
  assert.match(bulkMatch[1], /canEditRosterImages/);
  assert.doesNotMatch(
    bulkMatch[1],
    /owner_steam_id|viewer_roster|e_team_roles_enum\.Admin/,
    "bulkApplyTeams must not retain team-owner/team-Admin self-service checks",
  );
}

{
  const src = await read("components/teams/TeamMember.vue");

  assert.match(
    src,
    /canEditRosterImage\(\): boolean \{\s*return \(\s*!this\.isInvite &&\s*useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.tournament_organizer\)/,
    "team-specific roster image editing must require isRoleAbove(tournament_organizer), independent of team.can_change_role",
  );

  // team.can_change_role must still exist and still gate the OTHER menu
  // actions (role assignment, remove member, set captain) - this fix must
  // not have repurposed or removed that shared check.
  assert.match(src, /team\.can_change_role && roles\?\.length/);
  assert.match(src, /team\.can_change_role && canRemoveMember/);
  assert.match(src, /canSetCaptain\(\): boolean \{\s*return !!\(this\.team\.can_change_role/);
}

console.log("roster image frontend permission checks passed");
