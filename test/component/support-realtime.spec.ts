import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { readFileSync } from "node:fs";
import path from "node:path";

// Leaf components only: the pages' own logic (subscriptions, ordering, the
// reply form gate, the list filters) is the real code under test.
vi.mock("~/components/PlayerDisplay.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["player"],
      setup: (props) => () => h("span", { "data-testid": "player" }, props.player?.name ?? "?"),
    }),
  };
});
vi.mock("~/components/TimeAgo.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ props: ["date"], setup: (props) => () => h("time", props.date) }) };
});
vi.mock("~/components/support/SupportAttachmentView.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["url", "contentType", "removedAt"],
      setup: (props) => () => (props.url ? h("a", { "data-testid": "attachment", href: props.url }, props.url) : null),
    }),
  };
});
const passthroughModule = vi.hoisted(() => async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ setup: (_p, { slots }) => () => h("div", slots.default?.()) }) };
});
vi.mock("~/components/support/SupportAttachmentInput.vue", passthroughModule);
vi.mock("~/components/PlayerProfileCard.vue", passthroughModule);
vi.mock("~/components/SanctionsHistoryPanel.vue", passthroughModule);
vi.mock("~/components/player/PlayerMatchRow.vue", passthroughModule);
vi.mock("~/components/LinkifyText.vue", passthroughModule);
vi.mock("~/components/TacticalPageHeader.vue", passthroughModule);
vi.mock("~/components/ui/transitions/PageTransition.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ setup: (_p, { slots }) => () => h("div", slots.default?.()) }) };
});
vi.mock("~/components/ui/textarea", async () => {
  const { defineComponent, h } = await import("vue");
  return { Textarea: defineComponent({ props: ["modelValue"], setup: () => () => h("textarea", { "data-testid": "reply-box" }) }) };
});
vi.mock("~/components/ui/select", async () => {
  const { defineComponent, h } = await import("vue");
  const passthrough = () => defineComponent({ setup: (_p, { slots }) => () => h("div", slots.default?.()) });
  return {
    Select: passthrough(),
    SelectContent: passthrough(),
    SelectItem: passthrough(),
    SelectTrigger: passthrough(),
    SelectValue: passthrough(),
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/utilities/uploadSupportAttachment", () => ({ uploadSupportAttachment: vi.fn() }));

const auth = vi.hoisted(() => ({ staff: false, steamId: "76561198000000001" }));

import SupportDetail from "../../pages/support/[id].vue";
import SupportStaffList from "../../pages/support-requests/index.vue";
import SupportMyList from "../../pages/support/index.vue";

const query = vi.fn();
const mutate = vi.fn();

const player = (steam_id: string, name: string, role = "user") => ({
  steam_id,
  name,
  avatar_url: null,
  custom_avatar_url: null,
  country: "DK",
  role,
});
const message = (id: string, createdAt: string, sender = player("2", "Staffer", "moderator"), extra: any = {}) => ({
  id,
  is_admin: sender.role === "moderator",
  message: `message ${id}`,
  created_at: createdAt,
  attachment_url: null,
  attachment_content_type: null,
  attachment_removed_at: null,
  sender,
  ...extra,
});
const request = (overrides: any = {}) => ({
  id: "req-1",
  category: "general_support",
  subject: "Cannot join",
  initial_message: "Opening text",
  status: "open",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  closed_at: null,
  reported_player_steam_id: null,
  reported_player_profile_url: null,
  related_match_reference: null,
  report_reason: null,
  report_details: null,
  report_evidence: null,
  organizer_motivation: null,
  organizer_experience: null,
  organizer_languages: null,
  organizer_additional_info: null,
  attachment_url: null,
  attachment_content_type: null,
  attachment_removed_at: null,
  player: player("1", "Asker"),
  messages: [],
  ...overrides,
});

const globalConfig = (id = "req-1") => ({
  config: { globalProperties: { $route: { params: { id } }, $router: { push: vi.fn() }, $apollo: { query, mutate } } as any },
  components: {
    Card: defineComponent({ setup: (_p, { slots }) => () => h("section", slots.default?.()) }),
    Badge: defineComponent({ setup: (_p, { slots }) => () => h("span", slots.default?.()) }),
    Button: defineComponent({ setup: (_p, { slots }) => () => h("button", slots.default?.()) }),
    Spinner: defineComponent({ setup: () => () => h("i", { "data-testid": "spinner" }) }),
    NuxtLink: defineComponent({ setup: (_p, { slots }) => () => h("a", slots.default?.()) }),
    Table: defineComponent({ setup: (_p, { slots }) => () => h("table", slots.default?.()) }),
    TableHeader: defineComponent({ setup: (_p, { slots }) => () => h("thead", slots.default?.()) }),
    TableBody: defineComponent({ setup: (_p, { slots }) => () => h("tbody", slots.default?.()) }),
    TableRow: defineComponent({ setup: (_p, { slots }) => () => h("tr", slots.default?.()) }),
    TableHead: defineComponent({ setup: (_p, { slots }) => () => h("th", slots.default?.()) }),
    TableCell: defineComponent({ setup: (_p, { slots }) => () => h("td", slots.default?.()) }),
  },
});

beforeEach(() => {
  query.mockReset();
  mutate.mockReset();
  auth.staff = false;
  vi.stubGlobal("useHead", vi.fn());
  vi.stubGlobal("definePageMeta", vi.fn());
  vi.stubGlobal("useAuthStore", () => ({
    isRoleAbove: () => auth.staff,
    me: { steam_id: auth.steamId },
  }));
});
afterEach(() => vi.unstubAllGlobals());

// <script setup> + Options script: the instance proxy is the one that carries data, methods and $apollo.
const inst = (vm: any) => vm.$.proxy;
const subscription = (Page: any, name: string) => Page.apollo.$subscribe[name];
async function deliver(Page: any, name: string, vm: any, data: any) {
  subscription(Page, name).result.call(inst(vm), { data });
  await flushPromises();
  await nextTick();
}
const mountDetail = async () => {
  const wrapper = mount(SupportDetail, { global: globalConfig() });
  await flushPromises();
  return wrapper;
};
const live = (wrapper: any, data: any) => deliver(SupportDetail, "supportRequestLive", wrapper.vm, { support_requests_by_pk: data });
const renderedMessages = (wrapper: any) =>
  wrapper.findAll("div.rounded-lg").map((node: any) => node.find("p").text());

describe("support request detail is live", () => {
  it("subscribes to the request by id and does not fetch on mount", async () => {
    const wrapper = await mountDetail();
    const live = subscription(SupportDetail, "supportRequestLive");
    expect(live.variables.call(inst(wrapper.vm))).toEqual({ id: "req-1" });
    const source = JSON.stringify(live.query);
    expect(source).toContain('"operation":"subscription"');
    expect(source).toContain("support_requests_by_pk");
    expect(source).toContain("messages");
    expect(query).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(true);
  });

  it("shows a remote reply without any refetch, ordered, with no duplicates", async () => {
    const wrapper = await mountDetail();
    const first = message("m1", "2026-10-01T11:00:00Z");
    await live(wrapper, request({ messages: [first] }));
    expect(renderedMessages(wrapper)).toEqual(["Opening text", "message m1"]);

    const reply = message("m2", "2026-10-01T12:00:00Z", player("1", "Asker"));
    await live(wrapper, request({ messages: [first, reply], updated_at: "2026-10-01T12:00:00Z" }));
    expect(renderedMessages(wrapper)).toEqual(["Opening text", "message m1", "message m2"]);

    // The same snapshot delivered again (reconnect, own mutation echo) changes nothing.
    await live(wrapper, request({ messages: [first, reply], updated_at: "2026-10-01T12:00:00Z" }));
    expect(renderedMessages(wrapper)).toEqual(["Opening text", "message m1", "message m2"]);
    expect(query).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Staffer");
    expect(wrapper.text()).toContain("Asker");
  });

  it("renders request and message attachments from the live data", async () => {
    const wrapper = await mountDetail();
    await live(
      wrapper,
      request({
        attachment_url: "support/request.png",
        messages: [message("m1", "2026-10-01T11:00:00Z", undefined, { attachment_url: "support/reply.png" })],
      }),
    );
    expect(wrapper.findAll('[data-testid="attachment"]').map((n) => n.text())).toEqual(["support/request.png", "support/reply.png"]);
  });

  it("hides the reply form when the request is closed remotely and restores it on reopen", async () => {
    const wrapper = await mountDetail();
    await live(wrapper, request());
    expect(wrapper.find("form").exists()).toBe(true);

    await live(wrapper, request({ status: "closed", closed_at: "2026-10-01T13:00:00Z", updated_at: "2026-10-01T13:00:00Z" }));
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).toContain("This request is closed");
    expect(wrapper.text()).toContain("Closed");

    await live(wrapper, request({ status: "open", closed_at: null, updated_at: "2026-10-01T14:00:00Z" }));
    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.text()).toContain("Open");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not refetch after sending a reply or changing status", async () => {
    auth.staff = true;
    mutate.mockResolvedValue({});
    const wrapper = await mountDetail();
    await live(wrapper, request());
    inst(wrapper.vm).reply = "On it";
    await inst(wrapper.vm).sendReply();
    await inst(wrapper.vm).changeStatus("closed");
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(query).not.toHaveBeenCalled();
  });

  it("shows not-found, not someone else's request, when the subscription returns nothing", async () => {
    const wrapper = await mountDetail();
    await live(wrapper, null);
    expect(wrapper.text()).toContain("Request not found, or you do not have permission to view it.");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("loads the reported player once, not on every reply", async () => {
    auth.staff = true;
    query.mockResolvedValue({ data: { players_by_pk: player("9", "Reported"), matches_by_pk: null } });
    const wrapper = await mountDetail();
    const report = request({ category: "player_report", reported_player_steam_id: "9" });
    await live(wrapper, report);
    const afterFirst = query.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    await live(wrapper, { ...report, messages: [message("m1", "2026-10-01T11:00:00Z")] });
    await live(wrapper, { ...report, status: "closed" });
    expect(query.mock.calls.length).toBe(afterFirst);
  });

  it("falls back to one plain fetch only when the subscription errors before any data", async () => {
    query.mockResolvedValue({ data: { support_requests_by_pk: request() } });
    const wrapper = await mountDetail();
    await subscription(SupportDetail, "supportRequestLive").error.call(inst(wrapper.vm));
    await flushPromises();
    expect(query).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Cannot join");
  });
});

describe("staff support list is live", () => {
  const row = (id: string, overrides: any = {}) => ({
    id,
    category: "general_support",
    subject: `Subject ${id}`,
    status: "open",
    updated_at: "2026-10-01T10:00:00Z",
    player: player("1", `Player ${id}`),
    ...overrides,
  });
  const mountList = async () => {
    auth.staff = true;
    const wrapper = mount(SupportStaffList, { global: globalConfig() });
    await flushPromises();
    return wrapper;
  };
  const push = (wrapper: any, rows: any[]) => deliver(SupportStaffList, "supportRequestsLive", wrapper.vm, { support_requests: rows });

  it("subscribes newest-updated first, with no one-off query", async () => {
    const wrapper = await mountList();
    const source = JSON.stringify(subscription(SupportStaffList, "supportRequestsLive").query);
    expect(source).toContain('"operation":"subscription"');
    expect(source).toContain("updated_at");
    expect(source).toContain("desc");
    expect(query).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shows a new request and status or updated_at changes live", async () => {
    const wrapper = await mountList();
    await push(wrapper, [row("a")]);
    expect(wrapper.text()).toContain("Subject a");
    expect(wrapper.text()).not.toContain("Subject b");

    await push(wrapper, [row("b", { updated_at: "2026-10-02T10:00:00Z" }), row("a")]);
    expect(wrapper.findAll("tbody tr").map((r) => r.text())[0]).toContain("Subject b");
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);

    // Closing a moves it out of the default "open" filter.
    await push(wrapper, [row("b"), row("a", { status: "closed" })]);
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Subject a");
    inst(wrapper.vm).statusFilter = "all";
    await nextTick();
    expect(wrapper.text()).toContain("Subject a");
  });

  it("keeps the category filter working on live data", async () => {
    const wrapper = await mountList();
    await push(wrapper, [row("a"), row("b", { category: "bug_report" })]);
    inst(wrapper.vm).categoryFilter = "bug_report";
    await nextTick();
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(wrapper.text()).toContain("Subject b");
  });

  it("keeps the moderator-only gate and stops loading if the subscription errors", async () => {
    expect(readFileSync(path.resolve("pages/support-requests/index.vue"), "utf8")).toContain('definePageMeta({ middleware: "moderator" })');
    const wrapper = await mountList();
    subscription(SupportStaffList, "supportRequestsLive").error.call(inst(wrapper.vm));
    await nextTick();
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(false);
  });
});

describe("my support list is live", () => {
  const mine = (id: string, status = "open") => ({
    id,
    category: "general_support",
    subject: `Mine ${id}`,
    status,
    updated_at: "2026-10-01T10:00:00Z",
  });
  it("subscribes only for the signed-in player and updates in place", async () => {
    const wrapper = mount(SupportMyList, { global: globalConfig() });
    await flushPromises();
    const sub = subscription(SupportMyList, "mySupportRequestsLive");
    expect(sub.variables.call(inst(wrapper.vm))).toEqual({ steamId: auth.steamId });
    expect(sub.skip()).toBe(false);
    expect(JSON.stringify(sub.query)).toContain("player_steam_id");
    expect(query).not.toHaveBeenCalled();

    await deliver(SupportMyList, "mySupportRequestsLive", wrapper.vm, { support_requests: [mine("a")] });
    expect(wrapper.text()).toContain("Mine a");
    expect(wrapper.text()).toContain("Open");
    await deliver(SupportMyList, "mySupportRequestsLive", wrapper.vm, { support_requests: [mine("a", "closed"), mine("b")] });
    expect(wrapper.text()).toContain("Closed");
    expect(wrapper.text()).toContain("Mine b");
  });

  it("does not subscribe before the player is known", () => {
    vi.stubGlobal("useAuthStore", () => ({ me: null, isRoleAbove: () => false }));
    expect(subscription(SupportMyList, "mySupportRequestsLive").skip()).toBe(true);
  });
});
