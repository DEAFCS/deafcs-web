import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveInitialLocale } from "../utilities/resolveInitialLocale.ts";

// DEAFCS must default to English for every visitor regardless of
// browser/OS language, unless they already have an i18n_redirected cookie
// (explicit choice, or a prior auto-detection from before this fix).
// resolveInitialLocale is the pure decision plugins/default-locale.client.ts
// feeds into @nuxtjs/i18n's `i18n:beforeLocaleSwitch` hook.

test("no cookie + Danish navigator => English (browser language is never consulted)", () => {
  // The function doesn't take a navigator/browser language argument at
  // all -- "no existing cookie" always resolves to English regardless of
  // what @nuxtjs/i18n's own browser detection would otherwise have
  // matched (da, ru, or anything else in the supported locale list).
  assert.equal(resolveInitialLocale(false, true), "en");
});

test("no cookie + Russian navigator => English", () => {
  assert.equal(resolveInitialLocale(false, true), "en");
});

test("no cookie + English navigator => still English (no-op override)", () => {
  assert.equal(resolveInitialLocale(false, true), "en");
});

test("existing i18n_redirected=da is preserved -- override does not fire", () => {
  assert.equal(resolveInitialLocale(true, true), undefined);
});

test("existing i18n_redirected=ru is preserved -- override does not fire", () => {
  assert.equal(resolveInitialLocale(true, true), undefined);
});

test("not the initial setup (e.g. a later explicit setLocale call) is never overridden, even with no cookie yet", () => {
  assert.equal(resolveInitialLocale(false, false), undefined);
  assert.equal(resolveInitialLocale(true, false), undefined);
});

const pluginSource = await readFile(
  new URL("../plugins/default-locale.client.ts", import.meta.url),
  "utf8",
);
const nuxtConfigSource = await readFile(
  new URL("../nuxt.config.ts", import.meta.url),
  "utf8",
);
const settingsSource = await readFile(
  new URL("../pages/settings/index.vue", import.meta.url),
  "utf8",
);

test("the plugin hooks i18n:beforeLocaleSwitch and reads the same i18n_redirected cookie @nuxtjs/i18n uses", () => {
  assert.match(pluginSource, /nuxtApp\.hook\("i18n:beforeLocaleSwitch"/);
  assert.match(pluginSource, /useCookie<string \| undefined>\("i18n_redirected"\)/);
  assert.match(pluginSource, /resolveInitialLocale\(!!localeCookie\.value, initialSetup\)/);
});

test("the plugin uses object-form defineNuxtPlugin with enforce: \"pre\" -- this is what actually fixes the registration race (see startup simulation below)", () => {
  assert.match(pluginSource, /export default defineNuxtPlugin\(\{/);
  assert.match(pluginSource, /name:\s*"default-locale"/);
  assert.match(pluginSource, /enforce:\s*"pre"/);
  assert.match(pluginSource, /setup\(nuxtApp\)\s*\{/);
});

test("detectBrowserLanguage.useCookie stays enabled in nuxt.config.ts, so explicit setLocale() persistence is unaffected", () => {
  assert.match(nuxtConfigSource, /detectBrowserLanguage:\s*\{[\s\S]*?useCookie:\s*true/);
  assert.doesNotMatch(nuxtConfigSource, /detectBrowserLanguage:\s*false/);
  assert.match(nuxtConfigSource, /cookieKey:\s*"i18n_redirected"/);
});

test("the language selector (explicit switch path) is untouched -- still calls setLocale directly", () => {
  assert.match(settingsSource, /const \{ locale, locales, setLocale \} = useI18n\(\);/);
  assert.match(settingsSource, /setLocale\(newLocale\)/);
});

test("supported locales list and translation files are untouched by this fix", () => {
  assert.match(nuxtConfigSource, /\{ code: "da", name: "Dansk", file: "da_DK\.json"/);
  assert.match(nuxtConfigSource, /\{ code: "ru", name: "Русский", file: "ru_RU\.json"/);
  assert.match(nuxtConfigSource, /defaultLocale: "en"/);
});

// --- Startup-order simulation -----------------------------------------
//
// Regression coverage for the actual shipped bug: the previous version of
// this plugin registered its i18n:beforeLocaleSwitch listener correctly,
// but too LATE -- @nuxtjs/i18n's own plugins (i18n:plugin, then
// i18n:plugin:route-locale-detect) register via addPlugin(), which
// unshifts them ahead of a plain plugins/*.client.ts file in the raw
// plugin list (@nuxt/kit's addPlugin does
// `nuxt.options.plugins[opts.append ? "push" : "unshift"](plugin)`,
// default unshift). route-locale-detect fires the initial
// i18n:beforeLocaleSwitch synchronously during its own setup(), before a
// same-order ("default") plugins/*.client.ts file ever runs -- so a fresh
// Danish/no-cookie session got Danish, with our hook listener registered
// too late to catch it. Source-regex assertions alone (above) can't catch
// this class of bug, since the hook-registration code is present either
// way -- only simulating the actual ordering catches it.
//
// This harness reimplements the two Nuxt mechanisms that actually decide
// this, closely enough to prove the fix without booting a real Nuxt app:
//   1. the enforce-based sort Nuxt runs at build time
//      (nuxt/dist/shared/nuxt.*.mjs: pre=-20, default=0, post=20, then
//      `_plugins.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))`)
//   2. the sequential, dependsOn-aware execution loop Nuxt runs at runtime
//      (nuxt/dist/app/nuxt.js's applyPlugins: `for (const plugin of
//      plugins) await executePlugin(plugin)`, deferring a plugin until
//      everything in its `dependsOn` has resolved)

const ORDER = { pre: -20, default: 0, post: 20 };

function sortPluginsByEnforce(plugins) {
  // Array.prototype.sort is stable, so plugins tied at the same order
  // keep their original relative position -- exactly like Nuxt's real
  // sort, and exactly why an un-enforced plugins/*.client.ts file (order
  // 0, same as i18n's plugins) stays *after* i18n's addPlugin-unshifted,
  // already-order-0 entries: it was appended after them in the original
  // array, and the tie doesn't reorder it ahead.
  return [...plugins].sort(
    (a, b) => (ORDER[a.enforce ?? "default"] ?? 0) - (ORDER[b.enforce ?? "default"] ?? 0),
  );
}

async function runPluginsInOrder(sortedPlugins) {
  const resolved = new Set();
  const pending = [...sortedPlugins];
  let spins = 0;
  while (pending.length) {
    if (++spins > 1000) throw new Error("dependsOn cycle or unmet dependency");
    const plugin = pending.shift();
    const unmet = (plugin.dependsOn ?? []).filter((name) => !resolved.has(name));
    if (unmet.length) {
      pending.push(plugin);
      continue;
    }
    await plugin.setup();
    if (plugin.name) resolved.add(plugin.name);
  }
}

// Builds mock plugins standing in for the three real ones that matter:
// i18n:plugin, i18n:plugin:route-locale-detect (which fires the hook for
// a Danish, no-cookie visitor, exactly as loadAndSetLocale() does), and
// this repo's default-locale plugin. `includeEnforcePre` toggles the
// fix on/off to prove the test actually discriminates between them.
function buildStartupScenario({ includeEnforcePre }) {
  const events = [];
  const hookListeners = [];
  const nuxtApp = {
    hook(_name, fn) {
      hookListeners.push(fn);
    },
    async callHook(_name, payload) {
      for (const fn of hookListeners) {
        const result = await fn(payload);
        if (result !== undefined) return result;
      }
      return undefined;
    },
  };

  let resolvedLocale = null;

  const i18nPlugin = {
    name: "i18n:plugin",
    enforce: "default",
    async setup() {
      events.push("i18n:plugin");
    },
  };

  const routeLocaleDetect = {
    name: "i18n:plugin:route-locale-detect",
    enforce: "default",
    dependsOn: ["i18n:plugin"],
    async setup() {
      events.push("route-locale-detect:start");
      // A fresh Danish browser, no i18n_redirected cookie yet: detected
      // === "da", and route-locale-detect.js already applies it directly
      // via __setLocale(detected) before this fires, so oldLocale is
      // also "da" by the time loadAndSetLocale reads it (traced from the
      // real source) -- mirrored here as the hook payload.
      const detected = "da";
      const override = await nuxtApp.callHook("i18n:beforeLocaleSwitch", {
        oldLocale: detected,
        newLocale: detected,
        initialSetup: true,
      });
      resolvedLocale = override ?? detected;
      events.push("route-locale-detect:end");
    },
  };

  const defaultLocalePlugin = {
    name: "default-locale",
    enforce: includeEnforcePre ? "pre" : "default",
    async setup() {
      events.push("default-locale");
      nuxtApp.hook("i18n:beforeLocaleSwitch", ({ initialSetup }) =>
        resolveInitialLocale(/* hasExistingCookie */ false, initialSetup),
      );
    },
  };

  // Registration order mirrors reality: i18n's addPlugin-unshifted
  // plugins first, this repo's directory-scanned plugin appended last --
  // enforce is what has to correct that, not insertion position.
  return {
    plugins: [i18nPlugin, routeLocaleDetect, defaultLocalePlugin],
    events,
    getResolvedLocale: () => resolvedLocale,
  };
}

test("startup simulation: enforce:'pre' sorts default-locale before both default-order i18n plugins", () => {
  const { plugins } = buildStartupScenario({ includeEnforcePre: true });
  const sorted = sortPluginsByEnforce(plugins);
  assert.deepEqual(
    sorted.map((p) => p.name),
    ["default-locale", "i18n:plugin", "i18n:plugin:route-locale-detect"],
  );
});

test("startup simulation: a fresh Danish/no-cookie visit resolves to English when enforce:'pre' is present", async () => {
  const { plugins, events, getResolvedLocale } = buildStartupScenario({
    includeEnforcePre: true,
  });
  await runPluginsInOrder(sortPluginsByEnforce(plugins));

  // The hook listener registers, and i18n:plugin runs, before
  // route-locale-detect ever fires the hook.
  assert.deepEqual(events, [
    "default-locale",
    "i18n:plugin",
    "route-locale-detect:start",
    "route-locale-detect:end",
  ]);
  assert.equal(getResolvedLocale(), "en");
});

test("startup simulation: removing enforce:'pre' reproduces the shipped bug -- Danish wins because the hook fires before the listener exists", async () => {
  const { plugins, events, getResolvedLocale } = buildStartupScenario({
    includeEnforcePre: false,
  });
  const sorted = sortPluginsByEnforce(plugins);
  // Without "pre", default-locale is tied at order 0 with i18n's plugins
  // and keeps its original (last) position -- this is the exact shape of
  // the bug that shipped.
  assert.equal(sorted[sorted.length - 1].name, "default-locale");

  await runPluginsInOrder(sorted);

  assert.deepEqual(events, [
    "i18n:plugin",
    "route-locale-detect:start",
    "route-locale-detect:end",
    "default-locale",
  ]);
  assert.equal(getResolvedLocale(), "da");
});
