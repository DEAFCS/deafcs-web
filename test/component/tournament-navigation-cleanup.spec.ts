import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(/\r\n/g, "\n");

describe("Free Agents pool", () => {
  it("no longer explains who would be picked up next", () => {
    const source = read("components/tournament/TournamentFreeAgents.vue");
    expect(source).not.toMatch(/free_agents\.waitlist_explainer/);
    expect(source).not.toContain("topRatedWaitlisted");
    const en = JSON.parse(read("i18n/locales/en.json"));
    expect(en.tournament.free_agents.waitlist_explainer).toBeUndefined();
    expect(JSON.stringify(en.tournament.free_agents)).not.toMatch(/highest-rated|rule working/i);
  });

  it("keeps the status badges and ranks nobody as the next entrant", () => {
    const source = read("components/tournament/TournamentFreeAgents.vue");
    for (const key of ["status_drafted", "status_waitlisted", "tournament.free_agents.checked_in"]) {
      expect(source).toContain(key);
    }
    // The only highlight left is the status of each entry; no "best waitlisted".
    expect(source).not.toMatch(/reduce\(\(top, row\)/);
    // The check-in badge only reads the entry's own check-in.
    expect(source).toContain("tournament.check_in_required && row.agent.checked_in_at");
  });
});

describe("administration sidebar", () => {
  it("has no second Manage Tournaments link, and keeps the top-level Tournaments entry", () => {
    const nav = read("layouts/components/LeftNav.vue");
    expect(nav).not.toContain("tournaments-manage");
    expect(nav).not.toContain("administration.manage_tournaments");
    expect(nav).toContain("name: 'tournaments'");
  });

  it("the old /tournaments/manage page redirects to /tournaments, and nothing links to it", () => {
    const page = read("pages/tournaments/manage.vue");
    expect(page).toContain('redirect: "/tournaments"');
    for (const file of ["layouts/components/LeftNav.vue", "components/tournament/TournamentDetail.vue", "components/tournament/TournamentManage.vue"]) {
      expect(read(file)).not.toMatch(/tournaments\/manage|tournaments-manage/);
    }
  });
});
