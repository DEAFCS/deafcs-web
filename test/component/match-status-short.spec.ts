import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import MatchStatus from "../../components/match/MatchStatus.vue";

const t = (key: string) => key;
const mountStatus = (status: string, props: Record<string, unknown> = {}) =>
  mount(MatchStatus, {
    props: {
      match: { status, e_match_status: { description: "WAITING FOR PLAYERS TO CHECK IN" } },
      ...props,
    },
    global: { config: { globalProperties: { $t: t } as any } },
  });

describe("matches table status wording", () => {
  it("the table shows the short check-in status", () => {
    const wrapper = mountStatus("WaitingForCheckIn", { short: true });
    expect(wrapper.text()).toBe("match.status.waiting_check_in");
  });

  it("everywhere else the status keeps its full wording", () => {
    expect(mountStatus("WaitingForCheckIn").text()).toBe("WAITING FOR PLAYERS TO CHECK IN");
  });

  it("other statuses are unchanged in the table", () => {
    expect(mountStatus("Veto", { short: true }).text()).toBe("WAITING FOR PLAYERS TO CHECK IN");
    expect(mountStatus("Canceled", { short: true }).text()).toBe("match.status.cancelled");
  });

  it("the matches table rows ask for it, and the English label is in place", () => {
    const row = readFileSync(path.resolve(__dirname, "../../components/player/PlayerMatchRow.vue"), "utf8");
    const uses = row.match(/<MatchStatus[\s\S]*?\/>/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) expect(use).toMatch(/\bshort\b/);
    const en = JSON.parse(readFileSync(path.resolve(__dirname, "../../i18n/locales/en.json"), "utf8"));
    expect(en.match.status.waiting_check_in).toBe("Waiting for check-in");
  });
});
