import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// DEAFCS navigation: the top mega menu and the left sidebar carry the same
// three groups (upstream 5Stack's three columns).
// ROSTER: Players, Teams, Leaderboard (the sidebar adds Scrim Finder).
// LIBRARY: Utility Library, Highlights, Awards.
// SOCIAL: News, and Announcements for logged-in players only, opening the
// Chat Hub's Announcements tab. No Forum link; staff tools untouched.
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(
    /\r\n/g,
    "\n",
  );

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

const ascending = (positions: number[]) =>
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);

describe("top mega menu", () => {
  const desktop = between(
    topNav,
    `item.type === 'community'"`,
    `item.type === 'info'"`,
  );
  const columns = (() => {
    const library = desktop.indexOf('community.library.title")');
    const social = desktop.indexOf('community.social.title")');
    return {
      roster: desktop.slice(0, library),
      library: desktop.slice(library, social),
      social: desktop.slice(social),
    };
  })();

  it("has three columns, Roster, Library, Social", () => {
    expect(desktop.match(/navGroupLabelClasses/g)?.length).toBe(3);
    ascending(
      order(desktop, [
        'community.roster")',
        'community.library.title")',
        'community.social.title")',
      ]),
    );
  });

  it("puts each page in its column, in order", () => {
    ascending(
      order(columns.roster, ['to="/players"', 'to="/teams"', 'to="/leaderboard"']),
    );
    ascending(
      order(columns.library, ['to="/utility"', 'to="/highlights"', 'to="/awards"']),
    );
    expect(columns.library).not.toContain('to="/news"');
    ascending(order(columns.social, ['to="/news"', "openAnnouncements()"]));
  });

  it("keeps the descriptions under every item", () => {
    for (const key of [
      "players",
      "teams",
      "leaderboard",
      "utility",
      "highlights",
      "awards",
      "news",
      "announcements",
    ]) {
      expect(desktop).toContain(`layouts.top_nav.community.${key}.subtitle`);
    }
  });

  it("uses upstream 5Stack's three-column width", () => {
    expect(topNav).toContain(
      "md:min-w-[min(780px,calc(100vw-1.25rem))]",
    );
  });

  it("shows Announcements only with a session and opens the Hub's tab", () => {
    expect(columns.social).toMatch(/<li v-if="authStore\.me">/);
    expect(topNav).toContain('from "~/utilities/openAnnouncements"');
    // A button that opens the Hub, never a page a guest could load.
    expect(topNav).not.toMatch(/\/announcements|to="\/chat/);
  });

  it("gives the mobile menu the same three groups", () => {
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
      'community.social.title")',
      'to="/news"',
      'v-if="authStore.me"',
      "openAnnouncements();",
    ]);
  });

  it("links no Forum", () => {
    expect(topNav).not.toMatch(/to="\/forum"|name: 'forum'|social\.forum/);
  });
});

describe("left sidebar", () => {
  const groups = between(
    leftNav,
    'layouts.app_nav.roster.title")',
    'layouts.app_nav.information.title")',
  );
  const roster = groups.slice(0, groups.indexOf('layouts.app_nav.library.title")'));
  const library = groups.slice(
    groups.indexOf('layouts.app_nav.library.title")'),
    groups.indexOf('layouts.app_nav.social.title")'),
  );
  const social = groups.slice(groups.indexOf('layouts.app_nav.social.title")'));

  it("has Roster, Library and Social and no Community heading", () => {
    ascending(
      order(groups, [
        'layouts.app_nav.library.title")',
        'layouts.app_nav.social.title")',
      ]),
    );
    expect(leftNav).not.toMatch(/app_nav\.community\.title/);
  });

  it("orders Roster as Players, Teams, Scrim Finder, Leaderboard", () => {
    ascending(
      order(roster, [
        "name: 'players'",
        "name: 'teams'",
        "name: 'scrims'",
        "name: 'leaderboard'",
      ]),
    );
  });

  it("orders Library as Utility Library, Highlights, Awards", () => {
    ascending(order(library, ["name: 'utility'", "name: 'highlights'", 'to="/awards"']));
    expect(library).toContain("<HeGrenadeIcon");
    expect(library).not.toContain("name: 'news'");
  });

  it("puts News and, with a session only, Announcements in Social", () => {
    ascending(order(social, ["name: 'news'", "openAnnouncements()"]));
    expect(social).toMatch(/<SidebarMenuItem v-if="authStore\.me">/);
    expect(leftNav).toMatch(/<SidebarGroup v-if="newsEnabled \|\| authStore\.me">/);
    expect(leftNav).toContain("openAnnouncementsHub();");
    expect(leftNav).toMatch(/setOpenMobile\(false\)/);
  });

  it("links no Forum", () => {
    expect(leftNav).not.toMatch(/to="\/forum"|name: 'forum'/);
  });

  it("keeps the staff tools behind their role checks", () => {
    expect(leftNav).toMatch(/<SidebarGroup v-if="isAdmin">/);
    expect(leftNav).toMatch(
      /isAdmin \|\| isMatchOrganizer \|\| isTournamentOrganizer \|\| isStreamer \|\| canModerate/,
    );
    for (const link of ["/support", "terms-acceptances"]) {
      expect(leftNav).toContain(link);
    }
    const admin = leftNav.slice(leftNav.indexOf("app_nav.administration"));
    expect(admin).not.toMatch(/name: 'utility'|openAnnouncements/);
  });
});

describe("Utility Library icon", () => {
  it("has upstream's mask rule, so the HE artwork is not a plain square", () => {
    const css = read("assets/css/tailwind.css");
    const rule = between(css, ".he-grenade-mask {", "}");
    expect(rule).toContain('mask-image: url("/img/equipment/hegrenade.svg")');
    expect(rule).toContain('-webkit-mask-image: url("/img/equipment/hegrenade.svg")');
    expect(rule).toContain("mask-size: contain");
    expect(read("components/icons/HeGrenadeIcon.vue")).toContain("he-grenade-mask");
  });
});

describe("labels", () => {
  it("has English labels for the headings and Announcements", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    expect(en.layouts.app_nav.roster.title).toBe("Roster");
    expect(en.layouts.app_nav.library.title).toBe("Library");
    expect(en.layouts.app_nav.social.title).toBe("Social");
    expect(en.layouts.app_nav.navigation.announcements).toBe("Announcements");
    expect(en.layouts.app_nav.tooltips.announcements).toBe("Announcements");
    expect(en.layouts.top_nav.community.announcements.title).toBe("Announcements");
    expect(en.layouts.top_nav.community.announcements.subtitle).not.toContain(
      String.fromCharCode(0x2014),
    );
  });
});
