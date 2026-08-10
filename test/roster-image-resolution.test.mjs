import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// D. PlayerDisplay is avatar-only by default; roster images require explicit
// opt-in via allow-roster-image. avatarOverride still wins outright.
// ---------------------------------------------------------------------------
{
  const src = await read("components/PlayerDisplay.vue");

  assert.match(
    src,
    /allowRosterImage:\s*\{\s*type:\s*Boolean,\s*default:\s*false,?\s*\}/,
    "allowRosterImage prop must default to false (avatar-only unless opted in)",
  );

  const computedMatch = src.match(
    /playerAvatarSrc\(\)\s*\{([\s\S]*?)\n {4}\},/,
  );
  assert.ok(computedMatch, "playerAvatarSrc computed not found");
  const body = computedMatch[1];

  // avatarOverride branch must come first (team-specific always wins outright).
  const overrideIdx = body.indexOf("this.avatarOverride");
  const allowRosterIdx = body.indexOf("this.allowRosterImage");
  assert.ok(overrideIdx >= 0 && allowRosterIdx >= 0);
  assert.ok(
    overrideIdx < allowRosterIdx,
    "avatarOverride check must come before the allowRosterImage branch",
  );

  // The allowRosterImage branch must read roster_image_url; the non-allowed
  // path (falling out of the if) must NOT reference roster_image_url at all.
  const ifBlock = body.slice(allowRosterIdx);
  assert.match(ifBlock, /roster_image_url/);
  const afterIfBlock = body.slice(body.lastIndexOf("return resolveAvatarUrl("));
  assert.doesNotMatch(
    afterIfBlock,
    /roster_image_url/,
    "the final avatar-only fallback must never reference roster_image_url",
  );
  assert.match(afterIfBlock, /custom_avatar_url/);
  assert.match(afterIfBlock, /avatar_url/);
}

// ---------------------------------------------------------------------------
// C/D. Exact opt-in list: every file that must resolve team-specific/general
// roster images has allow-roster-image wired; identity/MM/Draft/sidebar/etc.
// surfaces do not.
// ---------------------------------------------------------------------------
const MUST_OPT_IN = [
  "components/MatchTableRow.vue",
  "components/match/HeadToHeadMatrix.vue",
  "components/match/LineupOpeningDuelRow.vue",
  "components/match/LineupRadarComparison.vue",
  "components/match/MatchInfo.vue",
  "components/match/MatchOverviewDrawer.vue",
  "components/match/MatchRoles.vue",
  "components/match/PlayerStatusDisplay.vue",
  "components/team/TeamCareerStats.vue",
  "components/teams/TeamMember.vue",
  "components/tournament/StageStandings.vue",
  "components/tournament/TournamentResults.vue",
  "components/tournament/TournamentTeamInvite.vue",
  "components/tournament/TournamentTeamMemberRow.vue",
  "pages/teams/[id].vue",
];

const MUST_STAY_AVATAR_ONLY = [
  // sidebar / account identity
  "layouts/components/LeftNav.vue",
  "layouts/components/TopNav.vue",
  // Matchmaking
  "components/matchmaking-lobby/FriendListItem.vue",
  "components/matchmaking-lobby/MatchLobby.vue",
  "components/matchmaking-lobby/MatchLobbyExpanded.vue",
  "components/matchmaking-lobby/LobbyInvite.vue",
  // Draft
  "components/draft-games/DraftPlayerCard.vue",
  "components/draft-games/DraftCoinFlip.vue",
  "components/draft-games/DraftRosterPicker.vue",
  "components/draft-games/DraftGameCard.vue",
  "pages/draft-room/[id].vue",
  // normal identity/list/search surfaces
  "components/PlayerSearch.vue",
  "components/SpotlightPlayerSearch.vue",
  "pages/leaderboard.vue",
  "pages/players/index.vue",
  "components/chat/ChatMessage.vue",
  "components/notification/NotificationContext.vue",
  "components/SanctionPlayer.vue",
  "components/servers/ServerPlayerManagement.vue",
  "components/RosterSlotPicker.vue",
  "components/teams/TeamForm.vue",
  "pages/league/seasons/[seasonId]/index.vue",
  "pages/settings/linked-accounts.vue",
  "pages/awards/[id].vue",
  "components/tournament/TournamentJoinForm.vue",
  "components/tournament/TournamentDetail.vue",
  "components/tournament/TournamentOrganizerRow.vue",
  "components/tournament/TournamentServerRow.vue",
];

for (const path of MUST_OPT_IN) {
  const src = await read(path);
  assert.match(
    src,
    /allow-roster-image/,
    `${path} must opt into roster images (team-assigned or tournament-roster context)`,
  );
}

for (const path of MUST_STAY_AVATAR_ONLY) {
  const src = await read(path);
  assert.doesNotMatch(
    src,
    /allow-roster-image/,
    `${path} must stay avatar-only (identity/MM/Draft/normal-list context) - roster images must not leak in`,
  );
}

// ---------------------------------------------------------------------------
// C. The five broken match-stat tabs now forward the real `match` object into
// LineupMember instead of the nonexistent `lineup_id` prop, so
// PlayerStatusDisplay's teamRosterAvatar can actually run.
// ---------------------------------------------------------------------------
const LINEUP_MEMBER_SITES = [
  "components/match/LineupAimStats.vue",
  "components/match/LineupTradeStats.vue",
  "components/match/LineupUtility.vue",
  "components/match/LineupOpeningDuelRow.vue",
];
for (const path of LINEUP_MEMBER_SITES) {
  const src = await read(path);
  assert.doesNotMatch(
    src,
    /lineup-member[^>]*:lineup_id/,
    `${path} must not bind the nonexistent :lineup_id prop on <lineup-member>`,
  );
  assert.match(
    src,
    /<lineup-member[^>]*:match="match"/,
    `${path} must forward :match="match" to <lineup-member> so team-specific resolution can run`,
  );
}
{
  const src = await read("components/match/LineupBuyTypes.vue");
  assert.doesNotMatch(src, /lineup-member[^>]*:lineup_id/);
  assert.match(src, /<lineup-member[^>]*:match="props\.match"/);
}

// PlayerStatusDisplay is the single reused resolver - LineupMember must not
// duplicate team-specific fallback logic itself.
{
  const src = await read("components/match/LineupMember.vue");
  assert.doesNotMatch(
    src,
    /roster_image_url|buildLineupAvatarOverride/,
    "LineupMember must delegate resolution to PlayerStatusDisplay, not reimplement it",
  );
}

// MatchRoles / LineupRadarComparison / LineupOpeningDuelRow mini-avatars now
// resolve a real per-team override via the shared buildLineupAvatarOverride
// helper instead of leaking straight to PlayerDisplay's default.
{
  const src = await read("components/match/MatchRoles.vue");
  assert.match(src, /buildLineupAvatarOverride/);
  assert.match(src, /avatarOverride/);
}
{
  const src = await read("components/match/LineupRadarComparison.vue");
  assert.match(src, /buildLineupAvatarOverride/);
  assert.match(src, /playerAAvatarOverride/);
  assert.match(src, /playerBAvatarOverride/);
}
{
  const src = await read("components/match/LineupOpeningDuelRow.vue");
  assert.match(src, /buildLineupAvatarOverride/);
  assert.match(src, /avatarOverrideFor/);
}

// ---------------------------------------------------------------------------
// Bug 2: MM/Draft (and their finished-match stats) must stay avatar-only.
// Real match-context components must gate allow-roster-image on
// match.is_tournament_match via the shared matchAllowsRosterImage helper (or
// an equivalent pre-existing isTournamentMatch computed) instead of a bare
// "true" literal - a real tournament match (real team or temporary
// tournament team) links via tournament_brackets; MM/Draft never do.
// ---------------------------------------------------------------------------
{
  const src = await read("utilities/teamRosterOverride.ts");
  assert.match(
    src,
    /export function matchAllowsRosterImage\(/,
    "the single shared match-context helper must exist",
  );
  assert.match(src, /match\?\.is_tournament_match/);
  assert.match(src, /match\?\.tournament_brackets\?\.length/);
}

// Match-context sites (rendered for MM, Draft, AND tournament matches alike)
// must gate on the match, never hardcode allow-roster-image="true".
const MATCH_CONTEXT_GATED = [
  "components/match/PlayerStatusDisplay.vue",
  "components/MatchTableRow.vue",
  "components/match/HeadToHeadMatrix.vue",
  "components/match/MatchInfo.vue",
  "components/match/MatchOverviewDrawer.vue",
  "components/match/MatchRoles.vue",
  "components/match/LineupRadarComparison.vue",
  "components/match/LineupOpeningDuelRow.vue",
];
for (const path of MATCH_CONTEXT_GATED) {
  const src = await read(path);
  assert.doesNotMatch(
    src,
    /:allow-roster-image="true"/,
    `${path} must not hardcode allow-roster-image="true" - MM/Draft matches render through this same component`,
  );
  assert.match(
    src,
    /:allow-roster-image="(allowRosterImage|isTournamentMatch)"/,
    `${path} must gate allow-roster-image on a match.is_tournament_match-derived value`,
  );
  assert.match(
    src,
    /matchAllowsRosterImage|isTournamentMatch/,
    `${path} must use the shared helper or an equivalent existing is_tournament_match check`,
  );
}

// Team-page-only and tournament-only surfaces are never MM/Draft contexts -
// they must keep the unconditional literal, not the match-gated helper.
const UNCONDITIONAL_TRUE = [
  "components/teams/TeamMember.vue",
  "components/team/TeamCareerStats.vue",
  "pages/teams/[id].vue",
  "components/tournament/StageStandings.vue",
  "components/tournament/TournamentResults.vue",
  "components/tournament/TournamentTeamMemberRow.vue",
  "components/tournament/TournamentTeamInvite.vue",
];
for (const path of UNCONDITIONAL_TRUE) {
  const src = await read(path);
  assert.match(
    src,
    /:allow-roster-image="true"/,
    `${path} is never an MM/Draft context - it must keep the unconditional allow-roster-image="true"`,
  );
}

// ---------------------------------------------------------------------------
// leaderboard.vue must query and forward player_custom_avatar_url (not just
// player_avatar_url) so /leaderboard shows a player's custom avatar the same
// way /players and player profiles already do, while staying roster-image-
// disabled (already asserted via MUST_STAY_AVATAR_ONLY above).
// ---------------------------------------------------------------------------
{
  const src = await read("pages/leaderboard.vue");

  assert.match(
    src,
    /player_custom_avatar_url:\s*string\s*\|\s*null/,
    "LeaderboardEntry must type player_custom_avatar_url",
  );

  const queryMatch = src.match(
    /const LEADERBOARD_QUERY = gql`([\s\S]*?)`;/,
  );
  assert.ok(queryMatch, "LEADERBOARD_QUERY not found");
  assert.match(
    queryMatch[1],
    /player_custom_avatar_url/,
    "LEADERBOARD_QUERY must select player_custom_avatar_url",
  );

  const playerObjectMatch = src.match(
    /:player="\{\s*steam_id:\s*entry\.player_steam_id,([\s\S]*?)\}"/,
  );
  assert.ok(
    playerObjectMatch,
    "synthetic PlayerDisplay player object not found",
  );
  assert.match(
    playerObjectMatch[1],
    /custom_avatar_url:\s*entry\.player_custom_avatar_url/,
    "the synthetic player object must map custom_avatar_url from entry.player_custom_avatar_url",
  );
  assert.match(
    playerObjectMatch[1],
    /avatar_url:\s*entry\.player_avatar_url/,
    "the synthetic player object must still map avatar_url from entry.player_avatar_url (Steam fallback)",
  );
}

console.log("roster image resolution + opt-in wiring checks passed");
