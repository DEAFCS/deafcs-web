import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import ts from "typescript";
import * as Vue from "vue";
import { mount } from "@vue/test-utils";
import { e_tournament_status_enum } from "../../generated/zeus";

// Render the actual hero ButtonGroup and execute its actual visibility gates,
// without Apollo subscriptions or unrelated tournament content.
const source = readFileSync(path.resolve(__dirname, "../../components/tournament/TournamentDetail.vue"), "utf8");
const descriptor = parse(source).descriptor;
const template = descriptor.template!.content;
const group = template.slice(template.indexOf('<ButtonGroup v-if="tournament?.is_organizer">'), template.indexOf("</ButtonGroup>") + "</ButtonGroup>".length);
const render = new Function("Vue", compile(group, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const script = ts.createSourceFile("detail.ts", descriptor.script!.content, ts.ScriptTarget.Latest, true);
const options = (script.statements.find(ts.isExportAssignment) as ts.ExportAssignment).expression as ts.ObjectLiteralExpression;
const computed = (options.properties.find(p => p.name?.getText(script) === "computed") as ts.PropertyAssignment).initializer as ts.ObjectLiteralExpression;
const auth = { isAdmin: false };
const gates = Object.fromEntries(["canGenerateTeams", "canDeleteTournament", "hasStatusActions"].map(name => {
  const method = computed.properties.find(p => p.name?.getText(script) === name)!;
  const js = ts.transpileModule(`const gates = { ${method.getText(script)} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return [name, new Function("useAuthStore", "e_tournament_status_enum", `${js}; return gates.${name};`)(() => auth, e_tournament_status_enum)];
}));
const slot = Vue.defineComponent({ setup: (_, ctx) => () => Vue.h("div", ctx.attrs, ctx.slots.default?.()) });
const Menu = Vue.defineComponent({ setup(_, ctx) {
  const open = Vue.ref(false);
  Vue.provide("menuOpen", open);
  return () => Vue.h("div", ctx.slots.default?.());
} });
const Trigger = Vue.defineComponent({ setup(_, ctx) {
  const open = Vue.inject<Vue.Ref<boolean>>("menuOpen")!;
  return () => Vue.h("div", { onClick: () => open.value = !open.value }, ctx.slots.default?.());
} });
const Content = Vue.defineComponent({ setup(_, ctx) {
  const open = Vue.inject<Vue.Ref<boolean>>("menuOpen")!;
  return () => open.value ? Vue.h("div", { "data-menu-content": "" }, ctx.slots.default?.()) : null;
} });
const handlers = ["openRegistration", "closeRegistration", "generateTeams", "startTournament", "resetToSetup", "cancelTournament"];
async function menu(overrides: Record<string, any> = {}, extra: Record<string, any> = {}) {
  auth.isAdmin = false;
  const methods = Object.fromEntries(handlers.map(name => [name, vi.fn()]));
  const w = mount(Vue.defineComponent({
    render, computed: gates, methods,
    data: () => ({ tournament: { id: "t1", is_organizer: true, status: "Setup", registration_version: 1, options: {}, ...overrides }, manageMode: false, me: { steam_id: "viewer" }, leagueSeasonId: null, isUnifiedRegistration: false, e_tournament_status_enum, deleteDialogOpen: false, pauseDialogOpen: false, resumeDialogOpen: false, ...extra }),
  }), { global: { mocks: { $t: (key: string) => key }, stubs: {
    ButtonGroup: slot, Button: { template: "<button><slot /></button>" },
    NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
    DropdownMenu: Menu, DropdownMenuTrigger: Trigger, DropdownMenuContent: Content,
    DropdownMenuLabel: slot, DropdownMenuSeparator: slot, DropdownMenuItem: { template: "<button><slot /></button>" },
    Settings: slot, ChevronDown: { template: '<svg data-chevron="down" />' }, Unlock: slot, Lock: slot, Shuffle: slot, Play: slot, Pause: slot, RotateCcw: slot, Ban: slot, Trash2: slot,
  } } });
  if (w.find('[data-testid="tournament-manage-menu"]').exists()) await w.get('[data-testid="tournament-manage-menu"]').trigger("click");
  return { w, methods };
}
const action = (w: any, key: string) => w.findAll("[data-menu-content] button").find((b: any) => b.text() === `tournament.actions.${key}`);

describe("public tournament lifecycle arrow", () => {
  it("keeps Manage as a route link, with downward arrow and status actions instead of sections", async () => {
    const { w } = await menu({ can_close_registration: true });
    expect(w.get('[data-testid="tournament-manage-link"]').attributes("href")).toBe("/tournaments/t1/manage");
    expect(w.get('[data-testid="tournament-manage-menu"]').attributes("aria-label")).toBe("tournament.manage.status_actions");
    expect(w.find('[data-chevron="down"]').exists()).toBe(true);
    expect(w.find('[data-menu-content]').text()).toContain("tournament.manage.status_actions");
    expect(group).not.toContain("tournamentManageSections");
    expect(group).not.toContain("section: item.key");
    expect(action(w, "close_registration")).toBeTruthy();
  });
  it.each([
    ["can_open_registration", "open_registration", "openRegistration"],
    ["can_close_registration", "close_registration", "closeRegistration"],
    ["can_start", "start", "startTournament"],
    ["can_setup", "reset_to_setup", "resetToSetup"],
    ["can_cancel", "cancel", "cancelTournament"],
  ])("respects %s and retains the %s handler", async (flag, label, handler) => {
    const { w, methods } = await menu({ [flag]: true });
    await action(w, label)!.trigger("click");
    expect(methods[handler]).toHaveBeenCalledOnce();
    await w.setData({ tournament: { ...w.vm.tournament, [flag]: false } });
    expect(action(w, label)).toBeUndefined();
  });
  it("pause/resume retain confirmation dialogs and resume replaces Start", async () => {
    const { w } = await menu({ can_start: true, can_resume: true, can_pause: true });
    expect(action(w, "start")).toBeUndefined();
    await action(w, "pause")!.trigger("click");
    expect(w.vm.pauseDialogOpen).toBe(true);
    await action(w, "resume")!.trigger("click");
    expect(w.vm.resumeDialogOpen).toBe(true);
    await w.setData({ tournament: { ...w.vm.tournament, can_resume: false, can_pause: false } });
    expect(action(w, "resume")).toBeUndefined();
    expect(action(w, "pause")).toBeUndefined();
  });
  it("delete requires ownership/admin, non-Live state and its confirmation", async () => {
    const { w } = await menu({ organizer_steam_id: "other" });
    expect(action(w, "delete")).toBeUndefined();
    await w.setData({ tournament: { ...w.vm.tournament, organizer_steam_id: "viewer" } });
    await action(w, "delete")!.trigger("click");
    expect(w.vm.deleteDialogOpen).toBe(true);
    await w.setData({ tournament: { ...w.vm.tournament, status: "Live" } });
    expect(action(w, "delete")).toBeUndefined();
  });
  it("league and non-organizer restrictions remain intact", async () => {
    const { w } = await menu({ can_setup: true, can_cancel: true, organizer_steam_id: "viewer" }, { leagueSeasonId: "league" });
    for (const label of ["reset_to_setup", "cancel", "delete"]) expect(action(w, label)).toBeUndefined();
    await w.setData({ tournament: { ...w.vm.tournament, is_organizer: false } });
    expect(w.find('[data-testid="tournament-manage-menu"]').exists()).toBe(false);
  });
  it("v1 Generate Teams remains unavailable to unified v2, and Manage gets the same actions", async () => {
    const { w } = await menu({ status: "RegistrationClosed", options: { individual_registration_enabled: true } });
    expect(action(w, "generate_teams")).toBeTruthy();
    await w.setData({ isUnifiedRegistration: true });
    expect(action(w, "generate_teams")).toBeUndefined();
    await w.setData({ manageMode: true, tournament: { ...w.vm.tournament, can_open_registration: true } });
    expect(action(w, "open_registration")).toBeTruthy();
    expect(w.find('[data-testid="tournament-manage-link"]').exists()).toBe(false);
  });
});
