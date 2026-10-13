import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerProfile = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);
const controls = await readFile(
  new URL("../components/player/PlayerHeroActions.vue", import.meta.url),
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

test("Add Friend uses the live none relationship and compact busy control", () => {
  assert.match(playerProfile, /this.friendRelationshipState === "none"/);
  assert.match(playerProfile, /pending: this.friendActionInFlight/);
  assert.match(
    controls,
    /<Tooltip v-else-if="canAddFriend">[\s\S]*?:disabled="pending"[\s\S]*?emit\('add'\)/,
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

test("outgoing request is interactive and gated by the shared busy state", () => {
  assert.match(
    controls,
    /relationship === 'outgoing'[\s\S]*?:disabled="pending"[\s\S]*?emit\('cancel'\)/,
  );
  assert.match(playerProfile, /@cancel="cancelRequestClick"/);
});

test("outgoing request shows a cancel icon on hover and keyboard focus", () => {
  assert.match(controls, /group-hover\/req:hidden/);
  assert.match(controls, /group-focus-visible\/req:block/);
  assert.match(controls, /cancel_request/);
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

test("incoming friendship uses the shared accept mutation instead of Add Friend", () => {
  assert.match(controls, /relationship === 'incoming'/);
  assert.match(
    playerProfile,
    /await useFriendActions\(\).acceptFriend\(this.player.steam_id\)/,
  );
});

test("accepted friend has a badge and Remove Friend is grouped in the menu", () => {
  assert.match(controls, /relationship === 'friend'/);
  assert.match(playerProfile, /key: "remove"/);
  assert.match(playerProfile, /run: this.removeFriendClick/);
});

test("removeFriendClick guards against an already in-flight request and keeps FRIEND state on failure (no optimistic switch)", () => {
  assert.match(
    playerProfile,
    /async removeFriendClick\(\)\s*\{[\s\S]*?const \{ isBusy, removeFriend \} = useFriendActions\(\);[\s\S]*?if \(isBusy\(this\.player\.steam_id\)\) return;[\s\S]*?await removeFriend\(this\.player\.steam_id\);/,
  );
});

test("the compact action slot is present beside recent form", () => {
  assert.match(
    playerProfile,
    /<PlayerHeroActions[\s\S]*?v-bind="heroActionsBind"/,
  );
});

test("relationship controls share the upstream square dimensions", () => {
  assert.match(controls, /inline-flex h-9 w-9 shrink-0/);
});

test("Add Friend no longer uses oversized full-width padding", () => {
  assert.doesNotMatch(playerProfile, /playerHeroAddFriendClasses/);
  assert.match(controls, /\[&_svg\]:h-4/);
});

test("the old full-width split is replaced by the upstream action group", () => {
  assert.doesNotMatch(playerProfile, /playerHeroActionsRowClasses/);
  assert.match(playerProfile, /<PlayerHeroActions/);
});

test("cancel hover uses CSS and cannot retain a stale page hover ref", () => {
  assert.doesNotMatch(playerProfile, /pendingButtonHovered/);
  assert.match(controls, /group\/req/);
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
