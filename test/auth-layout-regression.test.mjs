import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("the root route always uses the normal homepage and default layout", () => {
  assert.match(rootPage, /layout:\s*["']default["']/);
  assert.match(rootPage, /<LoadingScreen/);
  assert.match(rootPage, /<HomePlayerOverview[\s\S]*v-else-if="showLoggedInHome"/);
  assert.match(rootPage, /<main v-else/);
  assert.doesNotMatch(rootPage, /PreLaunchGate|Access Pending|showPreLaunchGate/);
  assert.doesNotMatch(rootPage, /shouldRenderApplicationShell|setPageLayout/);
});

test("the default layout renders the normal shell without auth-status swapping", () => {
  assert.match(appLayout, /<TopoBackground \/>/);
  assert.match(appLayout, /<TopNav v-if="!showLeftNav" \/>/);
  assert.match(appLayout, /<AppSidebar v-if="showLeftNav" \/>/);
  assert.doesNotMatch(
    appLayout,
    /isPrivateGateActive|shouldRenderApplicationShell|PreLaunchGate|Access Pending/,
  );
  assert.match(app, /<StreamGlobal v-if="hasGlobalStream" \/>/);
  assert.match(app, /<div v-if="me" style="display: contents">/);
});

test("public routes stay public and auth transport routes stay reachable", () => {
  for (const path of [
    "/",
    "/information",
    "/about",
    "/rules",
    "/contact",
    "/verification",
    "/awards",
    "/awards/",
    "/tournaments",
  ]) {
    assert.match(middleware, new RegExp(`['"]${path.replace("/", "\\/")}`));
  }

  assert.match(middleware, /isAuthTransportRoute/);
  assert.doesNotMatch(
    middleware,
    /getPrivateGateRedirect|shouldRenderApplicationShell|isRoleAbove|PreLaunchGate|Access Pending/,
  );
});

test("restricted routes keep their existing middleware permissions", () => {
  assert.match(middleware, /!hasMe && !isPublicRoute\(to\.path\)/);
  assert.match(rootPage, /HomePlayerOverview/);
  assert.match(appLayout, /authStore\.isRoleAbove\(e_player_roles_enum\.match_organizer\)/);
});

test("auth initialization has one middleware owner and navigation does not force reloads", () => {
  assert.equal((middleware.match(/getMe\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(rootPage, /authStore\.getMe\(\)/);
  assert.match(authStore, /if \(getMePromise\) \{\s*return getMePromise;/);
  assert.doesNotMatch(authStore, /void fetchMe\(\)/);
  assert.doesNotMatch(topNav, /onLogoClick|window\.location\.reload|location\.replace/);
  assert.doesNotMatch(leftNav, /onLogoClick|window\.location\.reload|location\.replace/);
  assert.doesNotMatch(logout, /window\.location\.reload|location\.replace/);
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
