import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// DEAFCS navigation: the top mega menu and the left sidebar carry the same two
// groups. ROSTER: Players, Teams, Leaderboard (the sidebar adds Scrim Finder).
// LIBRARY: Utility Library, Highlights, Awards, News. No Social/Community
// heading, no Forum or Announcements link; staff tools untouched.
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const topNav = read("layouts/components/TopNav.vue");
const leftNav = read("layouts/components/LeftNav.vue");

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
};

const order = (source: string, needles: string[]) =>
  needles.map((needle) => {
    const at = source.indexOf(needle);
    expect(at, needle).toBeGreaterThan(-1);
    return at;
  });

describe("top mega menu", () => {
  const desktop = between(
    topNav,
    `item.type === 'community'"`,
    `item.type === 'info'"`,
  );

  it("has exactly two columns, Roster then Library", () => {
    expect(desktop.match(/navGroupLabelClasses/g)?.length).toBe(2);
    const [roster, library] = order(desktop, [
      'community.roster")',
      'community.library.title")',
    ]);
    expect(roster).toBeLessThan(library);
    expect(desktop).not.toMatch(/community\.social\.title/);
  });

  it("puts Players, Teams, Leaderboard under Roster and the four library pages under Library", () => {
    const [roster, library] = [
      desktop.slice(0, desktop.indexOf('community.library.title")')),
      desktop.slice(desktop.indexOf('community.library.title")')),
    ];

    const positions = order(roster, [
      'to="/players"',
      'to="/teams"',
      'to="/leaderboard"',
    ]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(roster).not.toMatch(/to="\/awards"|to="\/utility"|to="\/news"/);

    const libraryPositions = order(library, [
      'to="/utility"',
      'to="/highlights"',
      'to="/awards"',
      'to="/news"',
    ]);
    expect([...libraryPositions].sort((a, b) => a - b)).toEqual(libraryPositions);
  });

  it("keeps the descriptions under every item", () => {
    for (const key of ["players", "teams", "leaderboard", "utility", "highlights", "awards", "news"]) {
      expect(desktop).toContain(`layouts.top_nav.community.${key}.subtitle`);
    }
  });

  it("gives the mobile menu the same two groups, Utility Library included", () => {
    const mobile = between(
      topNav,
      `v-else-if="item.type === 'community'"\n                  class="flex flex-col gap-1"`,
      `v-else-if="item.type === 'info'" class="flex flex-col gap-1"`,
    );
    order(mobile, [
      'community.roster")',
      'to="/players"',
      'to="/teams"',
      'to="/leaderboard"',
      'community.library.title")',
      'to="/utility"',
      'to="/highlights"',
      'to="/awards"',
      'to="/news"',
    ]);
  });

  it("links neither Forum nor Announcements anywhere", () => {
    // Links only: a code comment saying they are gone is not a link.
    expect(topNav).not.toMatch(
      /to="\/forum"|name: 'forum'|community\.social\.|\/announcements|type: "announcement"/,
    );
  });
});

describe("left sidebar", () => {
  const groups = between(
    leftNav,
    'layouts.app_nav.roster.title")',
    'layouts.app_nav.information.title")',
  );

  it("has Roster and Library and no Community or Social heading", () => {
    expect(groups).toContain('layouts.app_nav.library.title")');
    expect(leftNav).not.toMatch(/app_nav\.community\.title|app_nav\.social\.title/);
  });

  it("orders Roster as Players, Teams, Scrim Finder, Leaderboard", () => {
    const roster = groups.slice(0, groups.indexOf('layouts.app_nav.library.title")'));
    const positions = order(roster, [
      "name: 'players'",
      "name: 'teams'",
      "name: 'scrims'",
      "name: 'leaderboard'",
    ]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(roster).not.toMatch(/\/awards|name: 'news'|name: 'utility'/);
  });

  it("orders Library as Utility Library, Highlights, Awards, News", () => {
    const library = groups.slice(groups.indexOf('layouts.app_nav.library.title")'));
    const positions = order(library, [
      "name: 'utility'",
      "name: 'highlights'",
      'to="/awards"',
      "name: 'news'",
    ]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(library).toContain("<HeGrenadeIcon");
  });

  it("links neither Forum nor Announcements", () => {
    expect(leftNav).not.toMatch(/to="\/forum"|name: 'forum'/);
    expect(groups).not.toMatch(/announcement/i);
  });

  it("keeps the staff tools behind their role checks", () => {
    // The administration block is untouched: still gated, still complete.
    expect(leftNav).toMatch(/<SidebarGroup v-if="isAdmin">/);
    expect(leftNav).toMatch(/isAdmin \|\| isMatchOrganizer \|\| isTournamentOrganizer \|\| isStreamer \|\| canModerate/);
    for (const link of ["/support", "terms-acceptances"]) {
      expect(leftNav).toContain(link);
    }
    // Utility Library is ordinary navigation, never an admin item.
    const admin = leftNav.slice(leftNav.indexOf("app_nav.administration"));
    expect(admin).not.toMatch(/name: 'utility'/);
  });
});

describe("labels", () => {
  it("has English labels for the new headings and the sidebar's Utility Library", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    expect(en.layouts.app_nav.roster.title).toBe("Roster");
    expect(en.layouts.app_nav.library.title).toBe("Library");
    expect(en.layouts.app_nav.navigation.utility).toBe("Utility Library");
    expect(en.layouts.app_nav.tooltips.utility).toBe("Utility Library");
  });
});
