import { resolveInitialLocale } from "@/utilities/resolveInitialLocale";

// DEAFCS defaults to English for everyone, regardless of browser/OS
// language, unless a user has explicitly chosen another language (via
// Settings) or already been assigned one in a prior visit. Translations
// outside English are currently incomplete, so following the browser's
// language produces mixed-language pages.
//
// We can't just disable nuxt.config.ts's `i18n.detectBrowserLanguage` --
// setLocale()'s cookie persistence (pages/settings/index.vue's language
// picker) is gated by that exact same `useCookie` option
// (@nuxtjs/i18n's composer.setLocaleCookie), so turning detection off
// would also silently stop a user's manual language choice from
// surviving their next visit.
//
// Instead, hook the module's own `i18n:beforeLocaleSwitch` extension
// point and override only the very first, automatic resolution
// (`initialSetup`) -- and only when there's no `i18n_redirected` cookie
// yet at all. Once a cookie exists (from an explicit choice, or from a
// prior auto-detection before this fix), it's left untouched: we don't
// force-reset or rename it, because there's currently no way to tell an
// old auto-detected value apart from a genuine user choice, and
// resetting either indiscriminately would either erase real preferences
// or fail to fix anything.
//
// `enforce: "pre"` is required, not cosmetic: @nuxtjs/i18n's own plugins
// (`i18n:plugin`, then `i18n:plugin:route-locale-detect`) register via
// addPlugin(), which unshifts them ahead of this file in the raw plugin
// list, and route-locale-detect fires the initial i18n:beforeLocaleSwitch
// synchronously during ITS setup() -- before a plain plugins/*.client.ts
// file (default `enforce`, i.e. order 0, same as i18n's plugins) would
// ever get a chance to attach a listener. Nuxt sorts the full plugin list
// by enforce ("pre" = -20, "default" = 0, "post" = 20) before running it,
// so "pre" is what actually guarantees this plugin's hook is registered
// before route-locale-detect's setup() runs and fires it. Without this,
// a fresh Danish/Russian/etc. browser session detects and applies that
// language before this override ever exists to catch it -- which is
// exactly the bug this fixes (see the investigation that traced
// route-locale-detect.js's dependsOn: ["i18n:plugin"] and Nuxt's
// order-based plugin sort for the full mechanism).
export default defineNuxtPlugin({
  name: "default-locale",
  enforce: "pre",
  setup(nuxtApp) {
    const localeCookie = useCookie<string | undefined>("i18n_redirected");

    nuxtApp.hook("i18n:beforeLocaleSwitch", ({ initialSetup }) =>
      resolveInitialLocale(!!localeCookie.value, initialSetup),
    );
  },
});
