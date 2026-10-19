// Adapted from 5Stack WEB 2f97b21f and 117ebad3
// (tests/components/tournament/TournamentManualScheduling.spec.ts); MIT
// Copyright (c) 2025 5Stack.gg; see LICENSE.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import en from "../../i18n/locales/en.json";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: { steam_id: "1", role: "user" }, isRoleAbove: () => false }),
}));

import TournamentMatch from "../../components/tournament/TournamentMatch.vue";
import BracketScheduleDialog from "../../components/tournament/BracketScheduleDialog.vue";

const ETA_AHEAD = "2099-10-03T20:00:00.000Z";
const ETA_PASSED = "2000-10-03T20:00:00.000Z";

const t = (key: string) =>
  key.split(".").reduce((node: any, part) => node?.[part], en) ?? key;

function bracket(overrides: Record<string, any> = {}) {
  return {
    id: "bracket-1",
    round: 1,
    match_number: 1,
    bye: false,
    finished: false,
    scheduled_at: null,
    scheduled_eta: ETA_AHEAD,
    team_1: { id: "tt-1", name: "Iron Wolves", team: { name: "Iron Wolves" } },
    team_2: { id: "tt-2", name: "Night Owls", team: { name: "Night Owls" } },
    match: null,
    feeding_brackets: [],
    ...overrides,
  };
}

const stubs = {
  TimeAgo: { name: "TimeAgo", props: ["date"], template: "<span class='time-ago'>{{ date }}</span>" },
  BracketNegotiation: true,
  TournamentMatchResetFlow: true,
  MatchLineupScoreDisplay: true,
  MatchMapDots: true,
  Button: true,
};

beforeEach(() => {
  vi.stubGlobal("useNuxtApp", () => ({}));
  vi.stubGlobal("useRouter", () => ({ push: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mountCard(
  tournament: Record<string, unknown>,
  stageOptions: Record<string, unknown> | null = null,
  card: Record<string, any> = {},
) {
  const wrapper = mount(TournamentMatch as any, {
    props: {
      round: 1,
      brackets: [bracket(card)],
      stage: { type: "SingleElimination", options: stageOptions },
      tournament: {
        is_organizer: true,
        status: "Live",
        scheduling_mode: "auto",
        options: { match_mode: "auto" },
        ...tournament,
      },
    },
    global: { stubs, config: { globalProperties: { $t: t } as any } },
  });
  await flushPromises();
  return wrapper;
}

describe("TournamentMatch on a manually scheduled stage", () => {
  it("tells an organizer an admin-mode stage is awaiting a schedule, even with Auto Start on", async () => {
    const wrapper = await mountCard({ auto_start: true }, { match_mode: "admin" });

    expect(wrapper.text()).toContain("Awaiting schedule");
    expect(wrapper.find(".time-ago").exists()).toBe(false);
  });

  it("says so when Auto Start is off", async () => {
    const wrapper = await mountCard({ auto_start: false });

    expect(wrapper.text()).toContain("Awaiting schedule");
  });

  it("follows the bracket's own options before the stage's", async () => {
    const wrapper = await mountCard(
      { auto_start: true },
      { match_mode: "auto" },
      { options: { match_mode: "admin" } },
    );

    expect(wrapper.text()).toContain("Awaiting schedule");
  });

  it("shows the time an organizer gave it", async () => {
    const wrapper = await mountCard(
      { auto_start: true },
      { match_mode: "admin" },
      { scheduled_at: ETA_AHEAD },
    );

    expect(wrapper.text()).not.toContain("Awaiting schedule");
    expect(wrapper.find(".time-ago").text()).toBe(ETA_AHEAD);
  });

  it("shows nothing on an automatic stage whose teams are both known", async () => {
    const wrapper = await mountCard({ auto_start: true });

    expect(wrapper.text()).not.toContain("Awaiting schedule");
    expect(wrapper.find(".time-ago").exists()).toBe(false);
  });

  it("waits until both teams are in the bracket", async () => {
    const wrapper = await mountCard({ auto_start: false }, null, { team_2: null });

    expect(wrapper.text()).not.toContain("Awaiting schedule");
  });

  it("shows players the ETA while it is still ahead", async () => {
    const wrapper = await mountCard(
      { auto_start: true, is_organizer: false },
      { match_mode: "admin" },
    );

    expect(wrapper.text()).not.toContain("Awaiting schedule");
    expect(wrapper.find(".time-ago").text()).toBe(ETA_AHEAD);
  });

  it("tells players it is awaiting a schedule once the ETA has passed", async () => {
    const wrapper = await mountCard(
      { auto_start: true, is_organizer: false },
      { match_mode: "admin" },
      { scheduled_eta: ETA_PASSED },
    );

    expect(wrapper.text()).toContain("Awaiting schedule");
  });

  it("leaves negotiated scheduling to the teams", async () => {
    const wrapper = await mountCard({ auto_start: false, scheduling_mode: "negotiated" });

    expect(wrapper.text()).not.toContain("Awaiting schedule");
  });
});

describe("BracketScheduleDialog", () => {
  const dialogStubs = {
    Dialog: { template: "<div><slot /></div>" },
    DialogContent: { template: "<div><slot /></div>" },
    DialogHeader: { template: "<div><slot /></div>" },
    DialogTitle: { template: "<div><slot /></div>" },
    DialogDescription: { template: "<div><slot /></div>" },
    DialogFooter: { template: "<div><slot /></div>" },
    Popover: { template: "<div><slot /></div>" },
    PopoverTrigger: { template: "<div><slot /></div>" },
    PopoverContent: { template: "<div><slot /></div>" },
    Calendar: true,
    Input: true,
    TimeAgo: true,
    Button: {
      props: ["disabled"],
      emits: ["click"],
      template: "<button :disabled='disabled' @click=\"$emit('click')\"><slot /></button>",
    },
  };

  const mountDialog = (card: Record<string, any> = {}) => {
    const mutate = vi.fn().mockResolvedValue({ data: {} });
    const wrapper = mount(BracketScheduleDialog as any, {
      props: { open: true, bracket: bracket(card) },
      global: {
        stubs: dialogStubs,
        config: { globalProperties: { $t: t, $apollo: { mutate } } as any },
      },
    });
    return { wrapper, mutate };
  };

  const nowButton = (wrapper: any) =>
    wrapper.findAll("button").find((b: any) => b.text() === "Now");

  it("schedules a match for right now (ASAP)", async () => {
    const { wrapper, mutate } = mountDialog();
    const before = Date.now();

    await nowButton(wrapper).trigger("click");
    await flushPromises();

    expect(mutate).toHaveBeenCalledTimes(1);
    const set = JSON.stringify(mutate.mock.calls[0][0].mutation);
    const scheduled = set.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/)?.[0];
    expect(scheduled).toBeTruthy();
    expect(Date.parse(scheduled!)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(scheduled!)).toBeLessThanOrEqual(Date.now() + 1000);
    expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
  });

  it("does not offer Now once the match exists", () => {
    const { wrapper } = mountDialog({ match: { id: "m-1" } });

    expect(nowButton(wrapper).attributes("disabled")).toBeDefined();
  });
});

describe("bracket viewers open the schedule dialog", () => {
  const read = (file: string) =>
    readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("the Swiss viewer listens for schedule-bracket and renders the dialog", () => {
    const swiss = read("components/tournament/SwissBracketViewer.vue");
    expect(swiss).toContain('@schedule-bracket="handleScheduleBracket"');
    expect(swiss).toContain("<BracketScheduleDialog");
  });

  it("both viewers read the selected bracket by id from live data", () => {
    for (const file of [
      "components/tournament/SwissBracketViewer.vue",
      "components/tournament/TournamentBracketViewer.vue",
    ]) {
      expect(read(file)).toContain("selectedBracketId.value = bracket.id");
    }
  });
});
