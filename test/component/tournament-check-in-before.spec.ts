import { describe, expect, it, vi } from "vitest";
import { mount, shallowMount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import Before from "../../components/tournament/TournamentCheckInBefore.vue";
import Legacy from "../../components/tournament/TournamentCheckInInfo.vue";
import Panel from "../../components/tournament/TournamentCheckInPanel.vue";
import Time from "../../components/tournament/TournamentTime.vue";
import * as tooltipComponents from "../../components/ui/tooltip";
import { formatLocalTournamentClock, tournamentZoneAbbreviation } from "../../utilities/tournamentTime";
import en from "../../i18n/locales/en.json";

vi.mock("#app", () => ({ tryUseNuxtApp: () => undefined }));
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => ({ me: { steam_id: "p" }, isAdmin: false }) }));
vi.mock("@vue/apollo-composable", () => ({ useApolloClient: () => ({ client: { mutate: vi.fn() } }) }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));
const global = () => ({ plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })],
  stubs: { Button: { emits: ["click"], template: '<button @click="$emit(\'click\')"><slot /></button>' },
    FiveStackToolTip: { template: '<div><slot name="trigger" /></div>' } } });

describe("upstream before-registration presentation", () => {
  it("exposes the compact timezone tooltip on mouse hover", async () => {
    const value = "2026-10-10T11:00:00Z";
    const w = mount(Time, { attachTo: document.body, props: { value, display: "time", compactTooltip: true },
      global: { plugins: global().plugins, components: tooltipComponents } });
    await w.find("button").trigger("pointermove", { pointerType: "mouse" });
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(`${formatLocalTournamentClock(value)} ${tournamentZoneAbbreviation(value)}`);
    w.unmount();
  });
  it("renders the inline title, window, heading and register CTA, forwarding the action", async () => {
    const w = mount(Before, { props: { opensAt: "2026-10-10T11:00:00Z", closesAt: "2026-10-10T11:45:00Z" }, global: global() });
    expect(w.find("strong").text()).toBe("This tournament requires check-in.");
    expect(w.text()).toContain("Your team must confirm between");
    expect(w.text()).toContain("Register your team");
    expect(w.findAll("time")).toHaveLength(2);
    expect(w.text()).not.toContain("Shown in your local timezone");
    await w.findAll("button").at(-1)!.trigger("click");
    expect(w.emitted("register")).toHaveLength(1);
  });
  it("keeps legacy timing offsets and uses the same card without the old checklist", () => {
    const w = mount(Legacy, { props: { tournament: { status: "RegistrationOpen", can_join: true, start: "2026-10-10T12:00:00Z", attendance_check_in_open_before_minutes: 60, attendance_check_in_close_before_minutes: 15 }, isIndividualRegistration: false }, global: global() });
    expect(w.findAll("time").map(t => t.attributes("datetime"))).toEqual(["2026-10-10T11:00:00.000Z", "2026-10-10T11:45:00.000Z"]);
    expect(w.find("ul").exists()).toBe(false);
    expect(w.text()).toContain("Register your team");
  });
  it.each([{ alreadyEntered: true, can_join: true }, { alreadyEntered: false, can_join: false }])
    ("does not offer another registration when entered or blocked: %o", props => {
      const w = mount(Legacy, { props: { tournament: { status: "RegistrationOpen", start: "2026-10-10T12:00:00Z", can_join: props.can_join }, isIndividualRegistration: false, alreadyEntered: props.alreadyEntered }, global: global() });
      expect(w.text()).not.toContain("Register your team");
    });
});

describe("unified panel state preservation", () => {
  const registration = { check_in_required: true, check_in_setting: "Captains", check_in_opens_before_minutes: 60, check_in_closes_before_minutes: 15 };
  const tournament = { status: "RegistrationOpen", can_join: true, start: new Date(Date.now() + 86400000).toISOString(), min_players_per_lineup: 5 };
  const render = (extra: any = {}) => shallowMount(Panel, { props: { tournament, registration, ...extra }, global: global() });
  it("uses the shared upstream before card and forwards registration", async () => {
    const w = render();
    const before = w.findComponent(Before);
    expect(before.exists()).toBe(true);
    before.vm.$emit("register");
    expect(w.emitted("register")).toHaveLength(1);
    await w.setProps({ registration: { ...registration, check_in_required: false } });
    expect(w.find("section").exists()).toBe(false);
    w.unmount();
  });
  it("keeps a registered team pending, then done from its check-in stamp", async () => {
    const team = { id: "team", owner_steam_id: "p", roster: [] };
    const w = render({ teams: [team], myTeamId: "team" });
    expect(w.findComponent(Before).exists()).toBe(false);
    expect(w.text()).toContain("Check-in opens");
    await w.setProps({ teams: [{ ...team, checked_in_at: new Date().toISOString() }] });
    expect(w.text()).toContain("You're in.");
    w.unmount();
  });
  it("retains the free-agent pending state without offering another registration", () => {
    const w = render({ myFreeAgent: { id: "fa", status: "registered" } });
    expect(w.findComponent(Before).exists()).toBe(false);
    expect(w.text()).toContain("Check-in opens");
    w.unmount();
  });
});
