import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { browserUses12HourClock, formatLocalClock } from "../../utilities/dateLocale";

// 21:25 in the machine's own time zone: the helper never sets a time zone.
const evening = new Date(2026, 9, 9, 21, 25, 0);
const normalize = (value: string) => value.replace(/[  ]/g, " ");

describe("Free Agent sign-up clock follows the browser", () => {
  it.each(["da-DK", "de-DE", "en-GB", "sv-SE", "fr-FR"])("a %s browser reads the 24-hour clock", (browserLocale) => {
    expect(browserUses12HourClock(browserLocale)).toBe(false);
    // Even when the site is read in English, which resolves to en-US.
    expect(formatLocalClock(evening, { locale: "en", browserLocale })).toBe("21:25");
  });

  it.each(["en-US", "en-CA"])("a %s browser reads AM/PM", (browserLocale) => {
    expect(browserUses12HourClock(browserLocale)).toBe(true);
    expect(normalize(formatLocalClock(evening, { locale: "en", browserLocale }))).toBe("9:25 PM");
    expect(normalize(formatLocalClock(new Date(2026, 9, 9, 9, 5), { locale: "en", browserLocale }))).toBe("9:05 AM");
  });

  it("does not hardcode a clock, a region or a time zone", () => {
    const source = readFileSync(path.resolve(__dirname, "../../utilities/dateLocale.ts"), "utf8");
    expect(source).not.toMatch(/hour12\s*:/);
    expect(source).not.toMatch(/timeZone/);
    expect(source.replace(/\/\/.*$/gm, "")).not.toMatch(/Denmark|Europe|CEST|CET|Copenhagen/);
  });

  it("an unreadable browser locale falls back safely instead of throwing", () => {
    expect(() => browserUses12HourClock("not a locale")).not.toThrow();
  });

  it("the Free Agents list uses it, and an invalid date still shows a placeholder", () => {
    const source = readFileSync(path.resolve(__dirname, "../../components/tournament/TournamentFreeAgents.vue"), "utf8");
    expect(source).toContain("formatLocalClock(date)");
    expect(source).toMatch(/Number\.isNaN\(date\.getTime\(\)\)[\s\S]{0,40}return "--:--"/);
    expect(source).not.toMatch(/toLocaleTimeString\(dateLocale\(\)/);
  });
});
