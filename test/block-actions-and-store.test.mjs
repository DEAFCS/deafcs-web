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

test("a subscription failure is also shown to the user via toast, not just logged to the browser console (issue #97 item 7)", () => {
  assert.match(blockStore, /import \{ toast \} from "~\/components\/ui\/toast";/);
  const errorHandlerStart = blockStore.indexOf('error: (error: unknown) => {');
  assert.ok(errorHandlerStart > -1);
  const errorHandlerBody = blockStore.slice(errorHandlerStart, errorHandlerStart + 300);
  assert.match(errorHandlerBody, /console\.error\("my_blocks subscription failed", error\);/);
  assert.match(errorHandlerBody, /toast\(\{/);
  assert.match(errorHandlerBody, /variant: "destructive"/);
});

test("the toast call does not use useI18n()'s t() -- calling it from a Pinia store action outside setup context has already crashed SSR elsewhere in this codebase (MatchmakingStore.ts)", () => {
  const errorHandlerStart = blockStore.indexOf('error: (error: unknown) => {');
  const errorHandlerBody = blockStore.slice(errorHandlerStart, errorHandlerStart + 300);
  assert.doesNotMatch(errorHandlerBody, /useI18n|\$t\(|[^\w]t\(/);
});

test("isBlocked compares steam_id as strings, so a bigint vs string/number mismatch between the store and the caller can never desync the UI", () => {
  assert.match(
    blockStore,
    /function isBlocked\(steamId: string \| number \| bigint\): boolean \{\s*\n\s*const target = String\(steamId\);\s*\n\s*return blocked\.value\.some\(\(b\) => String\(b\.steam_id\) === target\);/,
  );
});
