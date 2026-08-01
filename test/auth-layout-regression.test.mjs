import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getPrivateGateRedirect,
  shouldRenderApplicationShell,
} from "../utilities/authGate.mjs";

const rootPage = await readFile(
  new URL("../pages/index.vue", import.meta.url),
  "utf8",
);
const appLayout = await readFile(
  new URL("../layouts/default.vue", import.meta.url),
  "utf8",
);
const app = await readFile(new URL("../app.vue", import.meta.url), "utf8");

test("shell policy is deterministic for loading, pending, verified, and admin states", () => {
  assert.equal(
    shouldRenderApplicationShell({ hasCheckedSession: false, canPassGate: false }),
    false,
  );
  assert.equal(
    shouldRenderApplicationShell({ hasCheckedSession: true, canPassGate: false }),
    false,
  );
  assert.equal(
    shouldRenderApplicationShell({ hasCheckedSession: true, canPassGate: true }),
    true,
  );
});

test("root keeps one default layout and renders the gate only inside it", () => {
  assert.match(rootPage, /layout:\s*["']default["']/);
  assert.doesNotMatch(rootPage, /setPageLayout/);
  assert.match(rootPage, /<PreLaunchGate v-if="showPreLaunchGate"/);
  assert.match(rootPage, /<HomePlayerOverview/);
});

test("default layout owns shell visibility for top navigation and admin sidebar", () => {
  assert.match(appLayout, /shouldRenderApplicationShell/);
  assert.match(appLayout, /<template v-if="isPrivateGateActive">\s*<slot \/>/s);
  assert.match(appLayout, /<TopNav v-if="!showLeftNav"/);
  assert.match(appLayout, /<AppSidebar v-if="showLeftNav"/);
  assert.match(app, /!isPrivateGateActive/);
});

test("root navigation is stable for direct, client, repeated, and logout flows", () => {
  const verified = { hasMe: true, canPassGate: true };
  const pending = { hasMe: true, canPassGate: false };
  const loggedOut = { hasMe: false, canPassGate: false };

  assert.equal(getPrivateGateRedirect("/", verified), null);
  assert.equal(getPrivateGateRedirect("/", verified), null);
  assert.equal(getPrivateGateRedirect("/", pending), null);
  assert.equal(getPrivateGateRedirect("/", loggedOut), null);
  assert.equal(getPrivateGateRedirect("/play", verified), null);
  assert.equal(getPrivateGateRedirect("/play", pending), "/");
  assert.equal(getPrivateGateRedirect("/play", loggedOut), "/");
  assert.equal(getPrivateGateRedirect("/logout", loggedOut), null);
});
