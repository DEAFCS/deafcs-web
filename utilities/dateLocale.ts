// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { tryUseNuxtApp } from "#app";

// `toLocale*(undefined, …)` formats using the *browser's* locale, not the app's.
// A player reading the UI in Japanese from an en-US browser still got American
// date formats — which stopped being defensible once all 16 locales were filled
// in. The configured locale codes are already valid BCP-47 tags (en, de,
// zh-Hans, …), so they can be handed straight to Intl.
//
// Returns undefined — i.e. the previous browser-locale behaviour — whenever
// there is no Nuxt context to read from, so this can never throw at render.
export function dateLocale(): string | undefined {
  const locale = (tryUseNuxtApp()?.$i18n as { locale?: unknown } | undefined)
    ?.locale;
  const value =
    typeof locale === "string"
      ? locale
      : (locale as { value?: unknown } | undefined)?.value;

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// The clock the viewer's own browser uses: 24-hour for locales that normally
// show it (most of Europe), 12-hour with AM/PM for the ones that do not (the
// US). dateLocale() is the app's UI language, and "en" resolves to en-US
// everywhere, so a European reading the site in English got AM/PM. The
// language of the text stays the app's; only the hour cycle follows the
// browser. The time zone is the browser's own, as before.
export function browserUses12HourClock(browserLocale?: string): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(browserLocale, {
      hour: "numeric",
    }).resolvedOptions().hourCycle;
    return cycle === "h11" || cycle === "h12";
  } catch {
    return false;
  }
}

export function formatLocalClock(
  date: Date,
  options: { locale?: string; browserLocale?: string } = {},
): string {
  const twelveHour = browserUses12HourClock(options.browserLocale);

  return date.toLocaleTimeString(options.locale ?? dateLocale(), {
    hour: twelveHour ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: twelveHour ? "h12" : "h23",
  });
}
