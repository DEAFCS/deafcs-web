import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);

// Root cause of "clicking Block does nothing" (issue #97, second report):
// pages/players/[id].vue is ONE SFC with TWO separate <script> blocks -- a
// `<script setup>` block (top) and a plain Options API `<script>` block
// (bottom, with data()/computed/methods). A `<script setup>` top-level
// `const x = ref(...)` is NOT bridged onto `this` for the Options block in
// this codebase's build: confirmed empirically against the real built app
// (not just an isolated test fixture) -- a bare reference throws
// `ReferenceError: showBlockConfirm is not defined`, and `this.showBlockConfirm`
// silently reads back `undefined` instead of the ref's value. Every OTHER
// dialog-toggle in this file avoids the problem by staying on one side of
// that boundary: showDemoUpload is a real `<script setup>` ref, but is only
// ever touched from template expressions (which DO resolve correctly,
// through a different mechanism than an Options method body); editPlayerSheet
// is a genuine Options `data()` property, touched only from Options-world
// code. showBlockConfirm is the only one that tried to split declaration
// (setup) from mutation (an Options method) -- the fix moves its
// declaration into data() to match editPlayerSheet's working pattern.
const scriptSetupEnd = source.indexOf("</script>");
const scriptSetupBody = source.slice(0, scriptSetupEnd);
const optionsScriptStart = source.indexOf('<script lang="ts">', scriptSetupEnd);
const optionsScriptBody = source.slice(optionsScriptStart);

test("showBlockConfirm is declared as Options data(), not a <script setup> ref", () => {
  assert.doesNotMatch(
    scriptSetupBody,
    /const showBlockConfirm = ref\(/,
    "showBlockConfirm must not be declared in the <script setup> block",
  );
  assert.match(
    optionsScriptBody,
    /showBlockConfirm: false,/,
    "showBlockConfirm must be declared in the Options data() block",
  );
});

test("requestBlockPlayer/confirmBlockPlayer read and write showBlockConfirm via `this.`, never a bare reference", () => {
  assert.match(
    optionsScriptBody,
    /requestBlockPlayer\(\)\s*\{\s*\n\s*if \(!this\.player\?\.steam_id \|\| this\.isSelfProfile\) return;\s*\n\s*this\.showBlockConfirm = true;/,
  );
  assert.match(
    optionsScriptBody,
    /await blockPlayer\(this\.player\.steam_id\);\s*\n\s*this\.showBlockConfirm = false;/,
  );
  // The specific bug: a bare `showBlockConfirm.value` anywhere in the
  // Options-script portion is exactly what threw the ReferenceError.
  assert.doesNotMatch(optionsScriptBody, /[^.]showBlockConfirm\.value/);
});

test("the AlertDialog's v-model:open still binds to showBlockConfirm", () => {
  assert.match(source, /<AlertDialog v-model:open="showBlockConfirm">/);
});

test("showDemoUpload (the OTHER dialog-toggle precedent) stays fully on the <script setup> side -- only template expressions touch it, no Options method", () => {
  assert.match(scriptSetupBody, /const showDemoUpload = ref\(false\);/);
  // None of the *.vue Options methods/computed reference it.
  assert.doesNotMatch(optionsScriptBody, /this\.showDemoUpload|[^.]showDemoUpload(?!\s*=\s*true"|\s*&&|\s*"|\s*:open)/);
});
