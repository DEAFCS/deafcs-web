import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getPrivateGateRedirect,
  isAuthTransportRoute,
  isPrivateGatePublicRoute,
} from "../utilities/authGate.mjs";

const middleware = await readFile(
  new URL("../middleware/auth.global.ts", import.meta.url),
  "utf8",
);
const gate = await readFile(
  new URL("../components/auth/PreLaunchGate.vue", import.meta.url),
  "utf8",
);

test("private gate keeps only landing and auth transport routes public", () => {
  assert.equal(isPrivateGatePublicRoute("/"), true);
  assert.equal(isPrivateGatePublicRoute("/login"), true);
  assert.equal(isPrivateGatePublicRoute("/play"), false);
  assert.equal(isPrivateGatePublicRoute("/players"), false);
  assert.equal(isAuthTransportRoute("/auth/steam"), true);
  assert.equal(isAuthTransportRoute("/auth/callback"), true);
  assert.equal(isAuthTransportRoute("/logout"), true);
  assert.equal(isAuthTransportRoute("/authentic"), false);
});

test("route access redirects guests and unverified accounts without loops", () => {
  assert.equal(getPrivateGateRedirect("/", { hasMe: false, canPassGate: false }), null);
  assert.equal(getPrivateGateRedirect("/", { hasMe: true, canPassGate: false }), null);
  assert.equal(getPrivateGateRedirect("/play", { hasMe: false, canPassGate: false }), "/");
  assert.equal(getPrivateGateRedirect("/play", { hasMe: true, canPassGate: false }), "/");
  assert.equal(getPrivateGateRedirect("/play", { hasMe: true, canPassGate: true }), null);
  assert.equal(getPrivateGateRedirect("/login", { hasMe: false, canPassGate: false }), null);
  assert.equal(getPrivateGateRedirect("/login", { hasMe: true, canPassGate: true }), "/");
  assert.equal(getPrivateGateRedirect("/auth/callback", { hasMe: false, canPassGate: false }), null);
  assert.equal(getPrivateGateRedirect("/logout", { hasMe: false, canPassGate: false }), null);
});

test("middleware uses the existing verified-user role hierarchy", () => {
  assert.match(
    middleware,
    /authStore\.isRoleAbove\(e_player_roles_enum\.verified_user\)/,
  );
  assert.match(middleware, /getPrivateGateRedirect/);
  assert.match(middleware, /return navigateTo\(gateRedirect\)/);
  assert.doesNotMatch(middleware, /\/players|\/leaderboard|\/tournaments/);
});

test("landing gate exposes required access states and local assets", () => {
  assert.match(gate, /Sign in through Steam/);
  assert.match(gate, /ACCESS PENDING/);
  assert.match(gate, /Your account is waiting for verification\./);
  assert.match(gate, /Sign out/);
  assert.match(gate, /\/favicon\/512\.png/);
  assert.match(gate, /prefers-reduced-motion/);
  assert.doesNotMatch(gate, /steamstatic\.com/);
});

test("landing gate uses a restrained orange wordmark offset and orange logo corners", () => {
  assert.match(gate, /\.prelaunch-wordmark h1 \{[\s\S]*color: #f5f5f4;/);
  assert.match(
    gate,
    /\.prelaunch-wordmark h1 span \{[\s\S]*top: 0\.2rem;[\s\S]*left: 0\.2rem;[\s\S]*-webkit-text-stroke: 1px rgb\(255 159 48 \/ 0\.34\);/,
  );
  assert.doesNotMatch(gate, /translate\(0\.24rem, 0\.24rem\)/);
  assert.match(
    gate,
    /\.prelaunch-corner \{[\s\S]*border-color: #ff9f30;/,
  );
});

test("landing gate gives pending access a spacious responsive layout", () => {
  assert.match(gate, /prelaunch-panel--pending/);
  assert.match(
    gate,
    /\.prelaunch-panel--pending \{[\s\S]*width: min\(100%, 52rem\);/,
  );
  assert.match(
    gate,
    /\.prelaunch-access--pending \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(11rem, 1fr\) minmax\(15rem, 1\.35fr\) auto;[\s\S]*column-gap:/,
  );
  assert.match(gate, /prelaunch-identity-copy/);
  assert.match(gate, /prelaunch-state-title/);
  assert.match(gate, /prelaunch-button prelaunch-button--quiet/);
  assert.match(
    gate,
    /@media \(max-width: 900px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*grid-row: 2;/,
  );
  assert.match(
    gate,
    /@media \(max-width: 640px\) \{[\s\S]*\.prelaunch-access--pending \{[\s\S]*flex-direction: column;/,
  );
});

test("landing gate keeps the Steam control visually crisp", () => {
  assert.match(gate, /\.prelaunch-steam-icon \{[\s\S]*background: transparent;/);
  assert.match(gate, /\.prelaunch-steam-icon svg \{[\s\S]*fill: #fff;/);
  assert.doesNotMatch(gate, /background: #1b2838/);
});
