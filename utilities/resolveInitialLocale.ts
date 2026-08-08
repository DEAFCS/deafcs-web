// Pure decision used by plugins/default-locale.client.ts to override
// @nuxtjs/i18n's automatic first-visit locale resolution. Kept in its own
// dependency-free module (no Nuxt auto-imports) so it's directly
// unit-testable without booting a Nuxt runtime.
//
// Deliberately ignores what the browser/OS actually detected: if there's
// no `i18n_redirected` cookie yet, the result is always "en", no matter
// what language navigator.languages or Accept-Language would otherwise
// have matched against DEAFCS's supported locale list.
export function resolveInitialLocale(
  hasExistingCookie: boolean,
  initialSetup: boolean,
): "en" | undefined {
  if (initialSetup && !hasExistingCookie) {
    return "en";
  }
  return undefined;
}
