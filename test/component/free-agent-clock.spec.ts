import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatLocalClock } from "../../utilities/dateLocale";

// 21:25 in the machine's own time zone: the helper never sets a time zone.
const evening = new Date(2026, 9, 9, 21, 25, 0);
const normalize = (value: string) => value.replace(/[  ]/g, " ");

// DEAFCS rule (2026-10-15): the clock is always 24-hour, also in English and
// on a US device. The DEAFCS language picks the words, the device only the
// time zone. See test/component/date-locale.spec.ts for the full rule.
describe("Free Agent sign-up clock is 24-hour in the DEAFCS language", () => {
  it.each(["en", "da", "de", "sv", "fr"])("DEAFCS in %s reads the 24-hour clock", (locale) => {
    expect(normalize(formatLocalClock(evening, { locale }))).toMatch(/^21[:.]25$/);
  });

  it("English never shows AM/PM", () => {
    expect(normalize(formatLocalClock(new Date(2026, 9, 9, 9, 5), { locale: "en" }))).toBe("09:05");
    expect(formatLocalClock(evening, { locale: "en" })).not.toMatch(/AM|PM/);
  });

  it("does not hardcode a clock option, a region or a time zone", () => {
    const source = readFileSync(path.resolve(__dirname, "../../utilities/dateLocale.ts"), "utf8");
    expect(source).not.toMatch(/hour12\s*:/);
    expect(source).not.toMatch(/timeZone/);
    expect(source.replace(/\/\/.*$/gm, "")).not.toMatch(/Denmark|Europe|CEST|CET|Copenhagen/);
  });

  it("an unreadable language falls back safely instead of throwing", () => {
    expect(() => formatLocalClock(evening, { locale: "not a locale!" })).not.toThrow();
  });

  it("the Free Agents list uses it, and an invalid date still shows a placeholder", () => {
    const source = readFileSync(path.resolve(__dirname, "../../components/tournament/TournamentFreeAgents.vue"), "utf8");
    expect(source).toContain("formatLocalClock(date)");
    expect(source).toMatch(/Number\.isNaN\(date\.getTime\(\)\)[\s\S]{0,40}return "--:--"/);
    expect(source).not.toMatch(/toLocaleTimeString\(dateLocale\(\)/);
  });
});
