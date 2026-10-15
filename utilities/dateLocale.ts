// Adapted from 5Stack WEB d18c33db and 538e796e; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { tryUseNuxtApp } from "#app";

// `toLocale*(undefined, …)` formats using the *device's* locale, not the
// app's. A Danish iPad reading DEAFCS in English got "lør. 13. okt. 14.00".
//
// DEAFCS rule (differs from upstream 538e796e, which takes the 12/24-hour
// clock and, for a same-language browser, the region from the browser):
// - the DEAFCS language picks the words and their order,
// - English reads as en-GB ("Sat 13 Oct, 14:00"),
// - the clock is always 24-hour, also in English (DEAFCS never shows AM/PM),
// - the device only supplies the time zone (Intl never changes the moment),
// - the device language is used only when there is no DEAFCS language.
const DATE_LOCALE_FOR_LANGUAGE: Record<string, string> = {
  en: "en-GB",
};

let resolvedCache:
  | { ui: string | undefined; browser: string | null; value: string | undefined }
  | undefined;

function uiLocale(): string | undefined {
  const locale = (tryUseNuxtApp()?.$i18n as { locale?: unknown } | undefined)
    ?.locale;
  const value =
    typeof locale === "string"
      ? locale
      : (locale as { value?: unknown } | undefined)?.value;

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function browserLanguage(): string | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return navigator.languages?.[0] || navigator.language || null;
}

export function resolveDateLocale(
  ui: string | undefined,
  browser: string | null,
): string | undefined {
  const base = ui ? (DATE_LOCALE_FOR_LANGUAGE[ui] ?? ui) : browser;
  if (!base) {
    return undefined;
  }
  try {
    return new Intl.Locale(base, { hourCycle: "h23" }).toString();
  } catch {
    return undefined;
  }
}

// `language` overrides the DEAFCS language read from i18n (for helpers that
// are handed `locale.value`); left out, it is read from the Nuxt app.
// Returns undefined (the device locale) only when nothing is known at all,
// so this can never throw at render.
export function dateLocale(language?: string): string | undefined {
  const ui = language || uiLocale();
  const browser = ui ? null : browserLanguage();
  if (
    !resolvedCache ||
    resolvedCache.ui !== ui ||
    resolvedCache.browser !== browser
  ) {
    resolvedCache = { ui, browser, value: resolveDateLocale(ui, browser) };
  }
  return resolvedCache.value;
}

// "21:25" in the viewer's own time zone, in the DEAFCS language.
export function formatLocalClock(
  date: Date,
  options: { locale?: string } = {},
): string {
  return date.toLocaleTimeString(dateLocale(options.locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}
