import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerProfile = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);
const english = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

test("relationship state is derived from useFriendActions (live my_friends subscription), not a local boolean", () => {
  assert.match(
    playerProfile,
    /friendRelationshipState\(\)\s*\{[\s\S]*?useFriendActions\(\)\.relationship\(this\.player\.steam_id\)/,
  );
  assert.doesNotMatch(playerProfile, /addFriendPending: false/);
});

test("ADD AS FRIEND only shows for relationship 'none', and is gated by friendActionInFlight", () => {
  assert.match(
    playerProfile,
    /canAddFriend\(\)\s*\{[\s\S]*?this\.friendRelationshipState === "none"/,
  );
  assert.match(
    playerProfile,
    /<button\s+v-else-if="canAddFriend"[\s\S]*?:disabled="friendActionInFlight"[\s\S]*?@click="addAsFriend"/,
  );
});

test("addAsFriend guards against an already in-flight request before mutating, and surfaces failures via toast instead of throwing raw errors", () => {
  assert.match(
    playerProfile,
    /async addAsFriend\(\)\s*\{[\s\S]*?const \{ isBusy, addFriend \} = useFriendActions\(\);[\s\S]*?if \(isBusy\(this\.player\.steam_id\)\) return;[\s\S]*?await addFriend\(this\.player\.steam_id\);/,
  );
  // Duplicate-key detection now lives in classifyFriendRequestError()
  // (composables/useFriendActions.ts), shared with PlayerDisplay.vue's own
  // addAsFriend() -- see test/friend-request-blocked-error.test.mjs and
  // test/component/friend-request-error-classification.spec.ts.
  assert.match(
    playerProfile,
    /const kind = classifyFriendRequestError\(error\);/,
  );
});

test("outgoing request renders a disabled, non-actionable PENDING button", () => {
  assert.match(
    playerProfile,
    /isFriendPending\(\)\s*\{\s*\n\s*return this\.friendRelationshipState === "outgoing";/,
  );
  assert.match(
    playerProfile,
    /<button\s+v-else-if="isFriendPending"[\s\S]*?playerHeroFriendPendingClasses[\s\S]*?disabled\s*\n[\s\S]*?friend_pending/,
  );
});

test("incoming request never falls through to ADD AS FRIEND", () => {
  assert.match(
    playerProfile,
    /isFriendIncoming\(\)\s*\{\s*\n\s*return this\.friendRelationshipState === "incoming";/,
  );
  assert.match(
    playerProfile,
    /<span\s+v-else-if="isFriendIncoming"[\s\S]*?friend_incoming/,
  );
});

test("accepted friend shows green FRIEND, flips to red REMOVE FRIEND? on hover/focus, and keyboard focus behaves like hover", () => {
  assert.match(
    playerProfile,
    /<button\s+v-else-if="isFriend"[\s\S]*?@mouseenter="friendButtonHovered = true"[\s\S]*?@mouseleave="friendButtonHovered = false"[\s\S]*?@focus="friendButtonHovered = true"[\s\S]*?@blur="friendButtonHovered = false"[\s\S]*?@click="removeFriendClick"/,
  );
  assert.match(
    playerProfile,
    /playerHeroFriendBadgeClasses =\s*\n\s*"[^"]*emerald/,
  );
  assert.match(
    playerProfile,
    /playerHeroRemoveFriendClasses =\s*\n\s*"[^"]*destructive/,
  );
});

test("removeFriendClick guards against an already in-flight request and keeps FRIEND state on failure (no optimistic switch)", () => {
  assert.match(
    playerProfile,
    /async removeFriendClick\(\)\s*\{[\s\S]*?const \{ isBusy, removeFriend \} = useFriendActions\(\);[\s\S]*?if \(isBusy\(this\.player\.steam_id\)\) return;[\s\S]*?await removeFriend\(this\.player\.steam_id\);/,
  );
});

test("hasRightColumn renders the hero action slot for every relationship state, not just none/friend", () => {
  assert.match(
    playerProfile,
    /hasRightColumn\(\)\s*\{\s*\n\s*return \(\s*\n\s*this\.isSelfProfile \|\|\s*\n\s*this\.canAddFriend \|\|\s*\n\s*this\.isFriend \|\|\s*\n\s*this\.isFriendPending \|\|\s*\n\s*this\.isFriendIncoming/,
  );
});

test("required en.json copy exists for every button state", () => {
  const detail = english.pages.players.detail;
  assert.equal(detail.friend, "Friend");
  assert.equal(detail.friend_pending, "Pending");
  assert.equal(detail.friend_remove_confirm, "Remove friend?");
  assert.equal(detail.friend_incoming, "Sent you a request");
  assert.ok(detail.friend_already_pending);
  assert.ok(detail.friend_add_error);
  assert.ok(detail.friend_remove_error);
});
