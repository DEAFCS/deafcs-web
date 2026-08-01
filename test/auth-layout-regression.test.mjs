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
const middleware = await readFile(
  new URL("../middleware/auth.global.ts", import.meta.url),
  "utf8",
);
const authStore = await readFile(
  new URL("../stores/AuthStore.ts", import.meta.url),
  "utf8",
);
const topNav = await readFile(
  new URL("../layouts/components/TopNav.vue", import.meta.url),
  "utf8",
);
const logout = await readFile(
  new URL("../layouts/components/Logout.vue", import.meta.url),
  "utf8",
);
const leftNav = await readFile(
  new URL("../layouts/components/LeftNav.vue", import.meta.url),
  "utf8",
);
const preloader = await readFile(
  new URL("../plugins/preloader.client.ts", import.meta.url),
  "utf8",
);

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

test("initial auth check has one owner and navigation does not force reloads", () => {
  assert.equal((middleware.match(/authStore\.getMe\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(rootPage, /authStore\.getMe\(\)/);
  assert.match(authStore, /if \(getMePromise\) \{\s*return getMePromise;/);
  assert.doesNotMatch(authStore, /void fetchMe\(\)/);
  assert.doesNotMatch(topNav, /onLogoClick|window\.location\.reload/);
  assert.doesNotMatch(leftNav, /onLogoClick|window\.location\.reload/);
  assert.doesNotMatch(logout, /window\.location\.reload/);
  assert.match(logout, /await navigateTo\("\/", \{ replace: true \}\)/);
});

test("the global preloader only fades once after the app mounts", () => {
  assert.match(preloader, /app\.hook\("app:mounted"/);
  assert.equal((preloader.match(/document\.body\.classList\.add/g) ?? []).length, 1);
  assert.equal(
    (preloader.match(/document\.body\.classList\.remove/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(preloader, /useRoute|watch\(|navigateTo|setPageLayout/);
});

test("cached identity remains provisional until the single network check resolves", () => {
  assert.match(
    authStore,
    /if \(hasCheckedSession\.value\) \{\s*return !!me\.value\?\.steam_id;/,
  );
  assert.match(
    authStore,
    /Cached identity is only a paint hint[\s\S]*global auth middleware owns starting/,
  );
  assert.match(middleware, /if \(!authStore\.hasCheckedSession\) \{\s*await authStore\.getMe\(\);/s);
});
