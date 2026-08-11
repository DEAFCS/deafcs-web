import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The visible #01/#02/#03 podium card's small stacked-avatar row used a
// separate playerAvatarSrc() helper that only ever resolved
// custom_avatar_url || avatar_url -- bypassing resolveRosterImageUrl
// entirely, unlike the already-correct HoverCardContent PlayerDisplay row
// right below it in the same component. This proves the visible card now
// shares the same team-specific -> general -> avatar priority, via the
// canonical resolver, without a second resolver being introduced.

const source = await readFile(
  new URL("../components/tournament/TournamentResults.vue", import.meta.url),
  "utf8",
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected to find function ${name}(`);
  const end = source.indexOf("\n}", start);
  return source.slice(start, end);
}

test("playerAvatarSrc reuses the canonical resolveRosterImageUrl, not a new resolver", () => {
  assert.match(
    source,
    /import \{ resolveRosterImageUrl \} from "~\/utilities\/rosterImage";/,
  );
  const fn = extractFunction("playerAvatarSrc");
  assert.match(fn, /resolveRosterImageUrl\(rosterRow, player \?\? null, apiDomain\)/);
});

test("playerAvatarSrc matches the roster row by steam id with safe String() normalization", () => {
  const fn = extractFunction("playerAvatarSrc");
  assert.match(
    fn,
    /String\(r\.player_steam_id\) === String\(player\?\.steam_id\)/,
  );
});

test("team-specific roster image takes priority over general roster image and avatar", () => {
  const fn = extractFunction("playerAvatarSrc");
  // resolveRosterImageUrl (team-specific) is tried first via ??, general
  // roster_image_url / custom_avatar_url / avatar_url only apply as a
  // fallback when the team-specific lookup resolves to null.
  const teamSpecificIdx = fn.indexOf("resolveRosterImageUrl(rosterRow");
  const fallbackIdx = fn.indexOf(
    "player.roster_image_url || player.custom_avatar_url || player.avatar_url",
  );
  assert.ok(teamSpecificIdx !== -1 && fallbackIdx !== -1);
  assert.ok(
    teamSpecificIdx < fallbackIdx,
    "expected the team-specific resolution to appear before the general/avatar fallback",
  );
});

test("general roster image and avatar remain reachable as fallbacks", () => {
  const fn = extractFunction("playerAvatarSrc");
  assert.match(fn, /player\.roster_image_url \|\| player\.custom_avatar_url \|\| player\.avatar_url/);
});

test("the visible podium card passes entry.realTeamRoster into playerAvatarSrc", () => {
  assert.match(
    source,
    /v-if="playerAvatarSrc\(p, entry\.realTeamRoster\)"/,
  );
  assert.match(
    source,
    /:src="playerAvatarSrc\(p, entry\.realTeamRoster\)"/,
  );
  assert.doesNotMatch(source, /playerAvatarSrc\(p\)/);
});

test("the already-correct hover PlayerDisplay row is untouched", () => {
  assert.match(
    source,
    /:avatar-override="teamRosterImageFor\(p, entry\.realTeamRoster\)"/,
  );
  assert.match(source, /:allow-roster-image="true"/);
});

console.log("tournament podium roster image checks passed");
