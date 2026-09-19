import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const useBlockActions = await readFile(
  new URL("../composables/useBlockActions.ts", import.meta.url),
  "utf8",
);
const blockStore = await readFile(
  new URL("../stores/BlockStore.ts", import.meta.url),
  "utf8",
);

// Issue #97: "clicking Block appears to do nothing". A real-AlertDialog
// component test (test/component/block-action-flow.spec.ts) already proves
// the click -> confirm dialog -> mutation-call wiring in pages/players/[id].vue
// itself is correct. These assertions cover the two files the issue calls out
// as most likely holding the actual cause: the mutation documents/variables
// useBlockActions.ts sends, and whether BlockStore's live subscription can
// fail silently.

test("BlockPlayer mutation inserts steam_id into my_blocks (matches v_my_blocks' insert_permissions column list)", () => {
  assert.match(
    useBlockActions,
    /mutation BlockPlayer\(\$steam_id: bigint!\)\s*\{\s*\n\s*insert_my_blocks_one\(object: \{ steam_id: \$steam_id \}\)/,
  );
});

test("UnblockPlayer mutation deletes my_blocks by steam_id (matches v_my_blocks' delete_permissions filter)", () => {
  assert.match(
    useBlockActions,
    /mutation UnblockPlayer\(\$steam_id: bigint!\)\s*\{\s*\n\s*delete_my_blocks\(where: \{ steam_id: \{ _eq: \$steam_id \} \}\)/,
  );
});

test("steam_id is always sent as a string (sid()), never a raw JS number -- bigint precision safety for steam64 IDs beyond Number.MAX_SAFE_INTEGER", () => {
  assert.match(useBlockActions, /function sid\(steam_id: string \| number \| bigint\)\s*\{\s*\n\s*return String\(steam_id\);/);
  assert.match(
    useBlockActions,
    /variables: \{ steam_id: sid\(steam_id\) \}/,
  );
});

test("blockPlayer/unblockPlayer both go through run(), so inFlight is always reset even if the mutation throws", () => {
  assert.match(
    useBlockActions,
    /async function run\(steam_id: string \| number, fn: \(\) => Promise<unknown>\) \{[\s\S]*?try \{\s*\n\s*await fn\(\);\s*\n\s*\} finally \{\s*\n\s*inFlight\[key\] = false;/,
  );
});

test("the my_blocks subscription has an error handler -- a schema/permission failure must not fail silently (regression: this was previously missing)", () => {
  assert.match(
    blockStore,
    /subscription\.subscribe\(\{\s*\n\s*next: \(\{ data \}: any\) => \{[\s\S]*?error: \(error: unknown\) => \{\s*\n\s*console\.error\("my_blocks subscription failed", error\);/,
  );
});

test("isBlocked compares steam_id as strings, so a bigint vs string/number mismatch between the store and the caller can never desync the UI", () => {
  assert.match(
    blockStore,
    /function isBlocked\(steamId: string \| number \| bigint\): boolean \{\s*\n\s*const target = String\(steamId\);\s*\n\s*return blocked\.value\.some\(\(b\) => String\(b\.steam_id\) === target\);/,
  );
});
