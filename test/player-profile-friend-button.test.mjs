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

test("outgoing request renders an interactive PENDING button, gated by friendActionInFlight (not hard disabled)", () => {
  assert.match(
    playerProfile,
    /isFriendPending\(\)\s*\{\s*\n\s*return this\.friendRelationshipState === "outgoing";/,
  );
  assert.match(
    playerProfile,
    /<button\s+v-else-if="isFriendPending"[\s\S]*?:disabled="friendActionInFlight"[\s\S]*?@click="cancelRequestClick"/,
  );
});

test("PENDING flips to red CANCEL REQUEST on hover/focus, mirroring FRIEND -> REMOVE FRIEND? exactly (own hover ref, not shared with friendButtonHovered)", () => {
  assert.match(
    playerProfile,
    /<button\s+v-else-if="isFriendPending"[\s\S]*?@mouseenter="pendingButtonHovered = true"[\s\S]*?@mouseleave="pendingButtonHovered = false"[\s\S]*?@focus="pendingButtonHovered = true"[\s\S]*?@blur="pendingButtonHovered = false"[\s\S]*?@click="cancelRequestClick"/,
  );
  // Reuses the exact same red destructive classes as the FRIEND -> REMOVE
  // hover state -- "similar to the existing Friend -> Remove interaction".
  assert.match(
    playerProfile,
    /<button\s+v-else-if="isFriendPending"[\s\S]{0,200}pendingButtonHovered\s*\n\s*\? playerHeroRemoveFriendClasses\s*\n\s*: playerHeroFriendPendingClasses/,
  );
  assert.doesNotMatch(playerProfile, /const pendingButtonHovered = ref\(false\);[\s\S]{0,300}friendButtonHovered = true/);
});

test("cancelRequestClick reuses the existing cancelRequest() from useFriendActions -- no new mutation", () => {
  assert.match(
    playerProfile,
    /async cancelRequestClick\(\)\s*\{\s*\n\s*if \(!this\.player\?\.steam_id\) return;\s*\n\s*const \{ isBusy, cancelRequest \} = useFriendActions\(\);\s*\n\s*if \(isBusy\(this\.player\.steam_id\)\) return;\s*\n\s*try \{\s*\n\s*await cancelRequest\(this\.player\.steam_id\);/,
  );
});

test("cancelRequestClick keeps PENDING on failure (no optimistic switch) and never puts the raw error in the toast", () => {
  const start = playerProfile.indexOf("async cancelRequestClick()");
  assert.ok(start > -1);
  const end = playerProfile.indexOf("\n    },", start);
  const body = playerProfile.slice(start, end);

  assert.match(body, /console\.error\("cancelRequest failed", error\);/);
  assert.match(
    body,
    /description: this\.\$t\("pages\.players\.detail\.friend_cancel_error"\)/,
  );
  assert.doesNotMatch(body, /description:\s*message/);
  assert.doesNotMatch(body, /description:[\s\S]*?error\.message/);
  assert.doesNotMatch(body, /description:[\s\S]*?\(error as Error\)/);
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

test("the full-width Friend/Block action row is untouched by the PENDING/cancel change", () => {
  assert.match(
    playerProfile,
    /const playerHeroActionsRowClasses = "flex w-full items-stretch gap-2";/,
  );
});

test("pendingButtonHovered is declared in <script setup> and touched only from template expressions, never from an Options method (the exact scoping bug fixed in a3245130 for showBlockConfirm)", () => {
  const scriptSetupEnd = playerProfile.indexOf("</script>");
  const scriptSetupBody = playerProfile.slice(0, scriptSetupEnd);
  const optionsScriptBody = playerProfile.slice(
    playerProfile.indexOf('<script lang="ts">', scriptSetupEnd),
  );
  assert.match(scriptSetupBody, /const pendingButtonHovered = ref\(false\);/);
  assert.doesNotMatch(optionsScriptBody, /pendingButtonHovered/);
});

test("required en.json copy exists for every button state", () => {
  const detail = english.pages.players.detail;
  assert.equal(detail.friend, "Friend");
  assert.equal(detail.friend_pending, "Pending");
  assert.equal(detail.friend_remove_confirm, "Remove friend?");
  assert.equal(detail.friend_cancel_request, "Cancel Request");
  assert.equal(detail.friend_incoming, "Sent you a request");
  assert.ok(detail.friend_already_pending);
  assert.ok(detail.friend_add_error);
  assert.ok(detail.friend_remove_error);
  assert.ok(detail.friend_cancel_error);
});
