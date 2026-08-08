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
export default defineNuxtPlugin((nuxtApp) => {
  const localeCookie = useCookie<string | undefined>("i18n_redirected");

  nuxtApp.hook("i18n:beforeLocaleSwitch", ({ initialSetup }) =>
    resolveInitialLocale(!!localeCookie.value, initialSetup),
  );
});
