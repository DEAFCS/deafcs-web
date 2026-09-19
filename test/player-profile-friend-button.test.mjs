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

test("Friend, Remove Friend, and Pending/Cancel Request share identical padding, since they share the exact same font size", () => {
  // These three use the same text-[0.72rem]/font-medium styling, so equal
  // padding (py-2) is both correct and sufficient for equal height -- no
  // font-based compensation needed between them.
  const classNames = [
    "playerHeroFriendBadgeClasses",
    "playerHeroRemoveFriendClasses",
    "playerHeroFriendPendingClasses",
  ];
  const paddings = classNames.map((name) => {
    const declStart = playerProfile.indexOf(`const ${name} =`);
    assert.ok(declStart > -1, `${name} not found`);
    const declEnd = playerProfile.indexOf(";", declStart);
    const decl = playerProfile.slice(declStart, declEnd);
    const match = decl.match(/\spy-(\S+)\s/);
    assert.ok(match, `${name} has no py-* utility`);
    return match[1];
  });
  assert.deepEqual(paddings, ["2", "2", "2"]);
});

test("Add Friend's padding is compensated for its larger font, so its RENDERED HEIGHT matches the other buttons despite different padding", () => {
  // Regression history, both measured in a real browser (production build,
  // forced auth + relationship state via the actual Pinia stores):
  //
  // 1. Add Friend originally used py-2.5 (10px) while every other
  //    friendship button used py-2 (8px): 40.8px vs 34.89px tall.
  // 2. Aligning Add Friend to py-2 closed most of the gap but not all of
  //    it: 37.2px vs 35.28px. The ~1.9px remainder is NOT padding -- it's
  //    Add Friend's intentionally larger/bolder font (text-[0.8rem] +
  //    font-bold, vs text-[0.72rem] + font-medium elsewhere -- its visual
  //    weight as the primary CTA, deliberately preserved) contributing a
  //    taller line box.
  //
  // Since font-size/weight must NOT change, the only way left to equalize
  // the final rendered height is to compensate with slightly less padding
  // on Add Friend specifically: py-[7.04px] (8px - half the ~1.92px line-
  // height delta per side). Re-measured after this change: Add Friend
  // 35.276px vs the other buttons' 35.28125px -- a ~0.005px difference,
  // imperceptible sub-pixel rounding, as close as achievable without
  // touching font-size/weight.
  //
  // This is why Add Friend's padding is intentionally DIFFERENT from the
  // other three (not equal, as an earlier version of this test required) --
  // it's compensating for a different font size to reach the same
  // intended height, not failing to match it.
  const declStart = playerProfile.indexOf("const playerHeroAddFriendClasses =");
  assert.ok(declStart > -1);
  const declEnd = playerProfile.indexOf(";", declStart);
  const decl = playerProfile.slice(declStart, declEnd);
  assert.match(decl, /\spy-\[7\.04px\]\s/);
  assert.doesNotMatch(decl, /\spy-2\.5\s/);
  assert.doesNotMatch(decl, /\spy-2\s/);
  // Font size/weight are unrelated UI -- explicitly confirm they were never
  // touched by this height fix.
  assert.match(decl, /text-\[0\.8rem\]/);
  assert.match(decl, /font-bold/);
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
