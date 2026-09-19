import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const useFriendActions = await readFile(
  new URL("../composables/useFriendActions.ts", import.meta.url),
  "utf8",
);
const playerProfile = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);
const playerDisplay = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);
const english = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

// Previously: a friend request rejected by api-deafcs's
// guard_friends_not_blocked trigger (a player-to-player block exists)
// surfaced its raw Postgres exception text directly in the error toast,
// via addAsFriend()'s `description: isDuplicate ? ... : message || ...`
// fallback. Fixed by classifying the error first
// (composables/useFriendActions.ts's classifyFriendRequestError, unit-
// tested for real in test/component/friend-request-error-classification.spec.ts)
// and showing a fixed, generic message for the "blocked" case in both of
// addAsFriend()'s call sites.
//
// A second pass found the SAME class of leak still present one level down:
// the generic ("unknown") fallback also did `description: message || ...`,
// so any OTHER rejection (not blocked, not a duplicate key -- a network
// error, a different constraint violation, a GraphQL validation error)
// still put the raw error text in the user-visible toast. Fixed by always
// using the translated friend_add_error string there too; the real error
// now only ever reaches console.error.

test("classifyFriendRequestError is exported and used by both addAsFriend() call sites", () => {
  assert.match(
    useFriendActions,
    /export function classifyFriendRequestError\(/,
  );
  assert.match(
    playerProfile,
    /import \{\s*\n\s*useFriendActions,\s*\n\s*classifyFriendRequestError,\s*\n\s*\} from "~\/composables\/useFriendActions";/,
  );
  assert.match(
    playerDisplay,
    /import \{\s*\n\s*useFriendActions,\s*\n\s*classifyFriendRequestError,\s*\n\s*\} from "~\/composables\/useFriendActions";/,
  );
});

for (const [name, source] of [
  ["pages/players/[id].vue", playerProfile],
  ["components/PlayerDisplay.vue", playerDisplay],
]) {
  test(`${name}: addAsFriend shows the fixed friendly toast for a "blocked" error, never the raw message`, () => {
    const addAsFriendStart = source.indexOf("async addAsFriend()");
    assert.ok(addAsFriendStart > -1, `addAsFriend() not found in ${name}`);
    const addAsFriendEnd = source.indexOf("\n    },", addAsFriendStart);
    const body = source.slice(addAsFriendStart, addAsFriendEnd);

    assert.match(body, /const kind = classifyFriendRequestError\(error\);/);
    assert.match(body, /if \(kind === "blocked"\)/);
    assert.match(
      body,
      /title: this\.\$t\(\s*\n\s*"pages\.players\.detail\.friend_request_unavailable_title",\s*\n\s*\)/,
    );
    assert.match(
      body,
      /description: this\.\$t\("pages\.players\.detail\.friend_blocked_error"\)/,
    );

    // The "blocked" branch must return before reaching the generic
    // fallback that would otherwise show the raw error message.
    const blockedBranchStart = body.indexOf('if (kind === "blocked")');
    const blockedBranchEnd = body.indexOf("}", body.indexOf("return;", blockedBranchStart)) + 1;
    const blockedBranch = body.slice(blockedBranchStart, blockedBranchEnd);
    assert.match(blockedBranch, /return;/);
    assert.doesNotMatch(blockedBranch, /description: message/);
  });

  test(`${name}: developer diagnostics for the blocked case go to console.error, not the toast`, () => {
    const addAsFriendStart = source.indexOf("async addAsFriend()");
    const addAsFriendEnd = source.indexOf("\n    },", addAsFriendStart);
    const body = source.slice(addAsFriendStart, addAsFriendEnd);
    assert.match(
      body,
      /console\.error\("addFriend rejected by a block relationship", error\);/,
    );
  });

  test(`${name}: unrelated friend-request behavior (duplicate/unknown cases) is unchanged`, () => {
    const addAsFriendStart = source.indexOf("async addAsFriend()");
    const addAsFriendEnd = source.indexOf("\n    },", addAsFriendStart);
    const body = source.slice(addAsFriendStart, addAsFriendEnd);
    assert.match(body, /title: this\.\$t\("common\.error"\)/);
    assert.match(
      body,
      /kind === "duplicate"\s*\n\s*\? this\.\$t\("pages\.players\.detail\.friend_already_pending"\)\s*\n\s*: this\.\$t\("pages\.players\.detail\.friend_add_error"\)/,
    );
  });

  test(`${name}: the raw error message is NEVER interpolated into a toast description -- only into console.error`, () => {
    const addAsFriendStart = source.indexOf("async addAsFriend()");
    const addAsFriendEnd = source.indexOf("\n    },", addAsFriendStart);
    const body = source.slice(addAsFriendStart, addAsFriendEnd);

    // Two toast({...}) calls exist (blocked, and duplicate/generic); both
    // must use only fixed, translated strings for `description`.
    assert.equal((body.match(/toast\(\{/g) || []).length, 2);
    assert.doesNotMatch(body, /description:\s*message/);
    assert.doesNotMatch(body, /description:[\s\S]*?error\.message/);
    assert.doesNotMatch(body, /description:[\s\S]*?\(error as Error\)/);

    // The raw error is no longer extracted into a `message` variable at
    // all -- console.error(error) takes the whole error object directly,
    // so there's nothing left for a toast to accidentally pick up.
    assert.doesNotMatch(body, /const message = \(error as Error\)/);
    assert.match(body, /console\.error\("addFriend failed", error\);/);
  });
}

test("the new toast copy exists and never mentions who blocked whom", () => {
  const detail = english.pages.players.detail;
  assert.equal(detail.friend_request_unavailable_title, "Friend request unavailable");
  assert.equal(
    detail.friend_blocked_error,
    "You cannot send a friend request to this player.",
  );
  for (const text of [
    detail.friend_request_unavailable_title,
    detail.friend_blocked_error,
  ]) {
    assert.doesNotMatch(text.toLowerCase(), /block(ed|s)? (you|me|them|him|her)|has blocked/);
  }
});
