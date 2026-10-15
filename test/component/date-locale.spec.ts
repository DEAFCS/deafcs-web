import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// The DEAFCS language the fake Nuxt app reports (undefined = none chosen).
const app = vi.hoisted(() => ({ language: undefined as string | undefined }));
vi.mock("#app", () => ({
  tryUseNuxtApp: () =>
    app.language ? { $i18n: { locale: { value: app.language } } } : undefined,
}));

import { dateLocale, formatLocalClock, resolveDateLocale } from "../../utilities/dateLocale";

// Saturday 13 October 2029, 12:00 UTC (14:00 in Copenhagen, CEST).
const saturday = new Date(Date.UTC(2029, 9, 13, 12, 0));
const matchListOptions: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};
const normalize = (value: string) => value.replace(/[  ]/g, " ");

function setDevice(languages: string[]) {
  Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
  Object.defineProperty(navigator, "language", { value: languages[0], configurable: true });
}

function format(date: Date, timeZone: string, options = matchListOptions) {
  return normalize(date.toLocaleString(dateLocale(), { ...options, timeZone }));
}

describe("dates follow the DEAFCS language, not the device language", () => {
  beforeEach(() => {
    app.language = undefined;
  });
  afterEach(() => {
    setDevice(["en-US"]);
  });

  it("Danish device, DEAFCS in English: Sat 13 Oct, 14:00", () => {
    setDevice(["da-DK", "da"]);
    app.language = "en";
    expect(format(saturday, "Europe/Copenhagen")).toBe("Sat 13 Oct, 14:00");
  });

  it("Danish device, DEAFCS in Danish: Danish words, 24-hour", () => {
    setDevice(["da-DK"]);
    app.language = "da";
    expect(format(saturday, "Europe/Copenhagen")).toBe("lør. 13. okt., 14.00");
  });

  it("English (US) device, DEAFCS in Danish: still Danish", () => {
    setDevice(["en-US"]);
    app.language = "da";
    expect(format(saturday, "Europe/Copenhagen")).toBe("lør. 13. okt., 14.00");
  });

  it("English is always 24-hour, also on a US device", () => {
    setDevice(["en-US"]);
    app.language = "en";
    expect(format(saturday, "America/New_York")).toBe("Sat 13 Oct, 08:00");
    expect(
      normalize(
        new Date(Date.UTC(2029, 9, 13, 21, 5)).toLocaleTimeString(dateLocale(), {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "UTC",
        }),
      ),
    ).toBe("21:05");
  });

  it("the device time zone still decides the local time (no UTC, no US)", () => {
    app.language = "en";
    expect(format(saturday, "Asia/Tokyo")).toBe("Sat 13 Oct, 21:00");
    expect(format(saturday, "America/Los_Angeles")).toBe("Sat 13 Oct, 05:00");
  });

  it("keeps DST right around the European change (25 Oct 2026)", () => {
    app.language = "en";
    const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
    expect(format(new Date(Date.UTC(2026, 9, 24, 12)), "Europe/Copenhagen", options)).toBe("14:00");
    expect(format(new Date(Date.UTC(2026, 9, 26, 12)), "Europe/Copenhagen", options)).toBe("13:00");
  });

  it("other DEAFCS languages keep their own words and order, 24-hour", () => {
    app.language = "de";
    expect(format(saturday, "Europe/Berlin")).toBe("Sa., 13. Okt., 14:00");
  });

  it("uses the device language only when there is no DEAFCS language", () => {
    setDevice(["da-DK"]);
    expect(format(saturday, "Europe/Copenhagen")).toBe("lør. 13. okt., 14.00");
    expect(resolveDateLocale(undefined, null)).toBeUndefined();
  });

  it("an explicit language (locale.value) wins over i18n", () => {
    app.language = "da";
    expect(dateLocale("en")).toBe("en-GB-u-hc-h23");
  });

  it("formatLocalClock is 24-hour in every language", () => {
    const evening = new Date(2026, 9, 9, 21, 25);
    for (const language of ["en", "da", "de", "sv", "fr"]) {
      expect(normalize(formatLocalClock(evening, { locale: language }))).toMatch(/^21[:.]25$/);
    }
  });

  it("an unknown language falls back instead of throwing", () => {
    expect(() => resolveDateLocale("not a locale!", null)).not.toThrow();
  });

  it("returns the same string on server and client (no hydration drift)", () => {
    app.language = "en";
    setDevice(["da-DK"]);
    const client = dateLocale();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
      expect(dateLocale()).toBe(client);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    }
  });
});

describe("player-visible date formatters use dateLocale()", () => {
  const files = [
    "components/player/PlayerMatchRow.vue",
    "components/match/MatchMaps.vue",
    "components/match/overview/OverviewSchedule.vue",
    "components/match/ScheduleMatch.vue",
    "pages/matches/[id]/index.vue",
    "components/tournament/TournamentAgendaRow.vue",
    "components/tournament/TournamentNextLan.vue",
    "components/tournament/BracketNegotiation.vue",
    "components/watch/WatchTournamentCard.vue",
    "components/watch/watchTicker.ts",
    "composables/useTournamentDisplay.ts",
    "components/play/PlayMatchmaking.vue",
    "components/team/TeamStage.vue",
    "components/team/TeamScrimRequests.vue",
    "components/notification/NotificationContext.vue",
    "components/league/SeasonScheduleTable.vue",
    "pages/players/[id].vue",
    "pages/tournaments/index.vue",
  ];

  it.each(files)("%s does not format dates with the device locale", (file) => {
    const source = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(source).not.toMatch(/(toLocale(Date|Time)?String|DateTimeFormat)\(\s*(undefined|navigator\.language|\[\]|"en-GB"|locale\.value)\s*[,)]/);
    expect(source).not.toMatch(/new Date\([^)]*\)\.toLocale(Date|Time)?String\(\)/);
    expect(source).toContain("dateLocale");
  });
});
