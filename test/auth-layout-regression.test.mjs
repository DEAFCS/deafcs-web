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
  assert.match(appLayout, /authStore\.isRoleAbove\(e_player_roles_enum\.moderator\)/);
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

test("all logged-in navigation variants show My Support Requests", () => {
  const guestTopNavStart = topNav.indexOf("<template v-else>");
  const loggedInTopNav = topNav.slice(
    topNav.indexOf('<template v-if="me">'),
    guestTopNavStart,
  );
  const guestTopNav = topNav.slice(guestTopNavStart);

  assert.match(
    loggedInTopNav,
    /<NuxtLink to="\/support"[^>]*>[\s\S]*My Support Requests/,
  );
  assert.doesNotMatch(loggedInTopNav, /isAdmin|administrator/);
  assert.doesNotMatch(guestTopNav, /My Support Requests|to="\/support"/);
  assert.match(
    leftNav,
    /<NuxtLink[\s\S]*?to="\/support"[\s\S]*?My Support Requests/,
  );
});

// Task 1.1 regression: LeftNav.vue's own canModerate gates on the
// Verification Applications / Support Requests links were individually
// correct, but layouts/default.vue's showLeftNav floor (the switch that
// decides whether <AppSidebar> -- which is what actually mounts LeftNav.vue
// -- renders at all, vs falling back to the plain <TopNav>) was still
// match_organizer, which ranks ABOVE moderator in AuthStore's roleOrder.
// A moderator therefore never got LeftNav.vue in the DOM in the first
// place; canModerate never even ran. isRoleAbove is a minimum-rank check,
// so lowering the floor to moderator is a strict widening: every role that
// satisfied match_organizer before still does (they rank higher), and only
// streamer/verified_user/user still fall back to TopNav, unchanged.
const roleOrder = [
  "user",
  "verified_user",
  "streamer",
  "moderator",
  "match_organizer",
  "tournament_organizer",
  "administrator",
];

function isRoleAbove(actualRole, requiredRole) {
  const requiredIndex = roleOrder.indexOf(requiredRole);
  const actualIndex = roleOrder.indexOf(actualRole);
  if (requiredIndex === -1 || actualIndex === -1) return false;
  return actualIndex >= requiredIndex;
}

test("showLeftNav mounts the sidebar (and therefore LeftNav.vue) for a moderator session", () => {
  const floorMatch = appLayout.match(
    /authStore\.isRoleAbove\(e_player_roles_enum\.(\w+)\)/,
  );
  assert.ok(floorMatch, "showLeftNav must call authStore.isRoleAbove(...)");
  const floorRole = floorMatch[1];

  // The actual regression, reproduced directly against the shipped floor:
  // a moderator must satisfy it (this is what was false before the fix).
  assert.equal(
    isRoleAbove("moderator", floorRole),
    true,
    "a moderator session must satisfy showLeftNav's role floor",
  );

  // Every role that could see the sidebar before this fix must still see it.
  for (const role of ["match_organizer", "tournament_organizer", "administrator"]) {
    assert.equal(
      isRoleAbove(role, floorRole),
      true,
      `${role} must still satisfy showLeftNav's role floor`,
    );
  }

  // Roles below moderator must still fall back to TopNav -- no widening
  // beyond moderator.
  for (const role of ["user", "verified_user", "streamer"]) {
    assert.equal(
      isRoleAbove(role, floorRole),
      false,
      `${role} must NOT satisfy showLeftNav's role floor`,
    );
  }
});

test("moderator's sidebar links are reachable end-to-end: showLeftNav mounts LeftNav.vue, and LeftNav.vue's own gate shows both links", () => {
  const floorMatch = appLayout.match(
    /authStore\.isRoleAbove\(e_player_roles_enum\.(\w+)\)/,
  );
  const sidebarMountsForModerator = isRoleAbove("moderator", floorMatch[1]);
  assert.equal(sidebarMountsForModerator, true);

  // LeftNav.vue's own per-link gates, only meaningful once the component
  // actually mounts.
  assert.match(
    leftNav,
    /verification_applications["'][\s\S]{0,400}?v-if="canModerate"|v-if="canModerate"[\s\S]{0,200}?verification_applications/,
  );
  assert.match(leftNav, /v-if="canModerate"[\s\S]{0,300}?Review support requests|Review support requests[\s\S]{0,300}?v-if="canModerate"/);
  assert.match(
    leftNav,
    /canModerate\(\)\s*\{\s*\n\s*return useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.moderator\);\s*\n\s*\},/,
  );
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
