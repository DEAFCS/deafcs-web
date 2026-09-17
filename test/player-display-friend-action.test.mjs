import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerDisplay = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);
const english = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

test("relationship state is derived from useFriendActions (same live my_friends subscription as the profile page), not a local boolean", () => {
  assert.match(
    playerDisplay,
    /friendRelationshipState\(\)\s*\{[\s\S]*?useFriendActions\(\)\.relationship\(this\.player\.steam_id\)/,
  );
  assert.match(
    playerDisplay,
    /isFriend\(\)\s*\{\s*\n\s*return this\.friendRelationshipState === "friend";/,
  );
});

test("Add Friend icon only shows for relationship 'none'", () => {
  assert.match(
    playerDisplay,
    /<Tooltip\s+v-if="\s*\n\s*me &&\s*\n\s*!isMe &&\s*\n\s*showAddFriend &&\s*\n\s*friendRelationshipState === 'none' &&/,
  );
});

test("outgoing request shows a non-actionable Pending indicator instead of Add Friend", () => {
  assert.match(
    playerDisplay,
    /isFriendPending\(\)\s*\{\s*\n\s*return this\.friendRelationshipState === "outgoing";/,
  );
  assert.match(
    playerDisplay,
    /<Tooltip\s+v-else-if="\s*\n\s*me &&\s*\n\s*!isMe &&\s*\n\s*showAddFriend &&\s*\n\s*isFriendPending &&/,
  );
  assert.match(
    playerDisplay,
    /<Clock class="w-4 h-4 text-muted-foreground" \/>[\s\S]*?matchmaking\.friends\.requested/,
  );
  assert.doesNotMatch(
    playerDisplay,
    /<Clock[^>]*@click/,
  );
});

test("incoming request falls through both Tooltip branches and never exposes Add Friend (Accept/Decline stays in the existing notification-toast flow)", () => {
  // Only two mutually exclusive branches gate the friend-action icon:
  // 'none' (Add) and outgoing/isFriendPending (Pending). An 'incoming'
  // relationship matches neither condition, so nothing renders for it --
  // verified by pulling the exact two-Tooltip sequence and confirming
  // there is no third branch (no v-else, no 'incoming' condition) that
  // could expose Add Friend for a received request.
  const match = playerDisplay.match(
    /<Tooltip\s+v-if="[\s\S]*?<\/Tooltip>\s*<Tooltip\s+v-else-if="[\s\S]*?<\/Tooltip>/,
  );
  assert.ok(match, "expected exactly the two friend-action Tooltip blocks");
  const block = match[0];
  assert.equal((block.match(/<Tooltip\b/g) || []).length, 2);
  assert.doesNotMatch(block, /v-else(?!-if)/);
  assert.doesNotMatch(block, /incoming/i);
});

test("addAsFriend guards against an already in-flight request and surfaces failures via toast instead of throwing raw errors", () => {
  assert.match(
    playerDisplay,
    /async addAsFriend\(\)\s*\{[\s\S]*?const \{ isBusy, addFriend \} = useFriendActions\(\);[\s\S]*?if \(isBusy\(this\.player\.steam_id\)\) return;[\s\S]*?await addFriend\(this\.player\.steam_id\);/,
  );
  assert.match(
    playerDisplay,
    /const isDuplicate =\s*\n\s*message\.includes\("friends_pkey"\)/,
  );
});

test("the Add Friend icon is visually disabled while a mutation is in flight", () => {
  assert.match(
    playerDisplay,
    /:class="\{ 'pointer-events-none opacity-50': friendActionInFlight \}"/,
  );
  assert.match(
    playerDisplay,
    /friendActionInFlight\(\)\s*\{[\s\S]*?useFriendActions\(\)\.isBusy\(this\.player\.steam_id\)/,
  );
});

test("showAddFriend prop and every other existing prop/behavior are untouched", () => {
  assert.match(playerDisplay, /showAddFriend: \{\s*\n\s*type: Boolean,\s*\n\s*default: false,/);
  assert.match(playerDisplay, /class="w-4 h-4 cursor-pointer hover:text-primary"/);
  assert.match(playerDisplay, /\$t\("player\.status\.add_friend"\)/);
});

test("reuses existing i18n copy -- no duplicate translation keys added for this control", () => {
  assert.equal(english.player.status.add_friend, "Add as friend");
  assert.equal(english.matchmaking.friends.requested, "Requested");
  assert.ok(english.pages.players.detail.friend_already_pending);
  assert.ok(english.pages.players.detail.friend_add_error);
});
