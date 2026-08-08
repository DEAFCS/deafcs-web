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
