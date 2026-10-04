import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterLink } from "vue-router";
import fs from "node:fs";
import path from "node:path";
import { MOBILE_CHAT_HUB_QUERY, useRightSidebar } from "../../composables/useRightSidebar";

// Private message header: the other player's avatar + name open their
// profile with same-context internal routing (the NuxtLink/players-id
// pattern from PlayerDisplay and Captain Pick), never a new tab, a
// window.open or an absolute URL that could hand the site off to the app.

vi.mock("~/components/LiveAvatarImg.vue", () => ({
  default: defineComponent({
    props: ["steamId", "fallbackUrl"],
    setup: (props) => () =>
      h("img", { "data-testid": "dm-avatar", "data-steam-id": props.steamId }),
  }),
}));

const OTHER = "76561190000000002";
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

function makeRouter() {
  const Blank = defineComponent({ render: () => null });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "index", component: Blank },
      { path: "/players/:id", name: "players-id", component: Blank },
    ],
  });
  return router;
}

let openSpy: ReturnType<typeof vi.spyOn>;

function setViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === MOBILE_CHAT_HUB_QUERY ? mobile : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => {
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  setViewport(false);
  localStorage.clear();
  // The Chat Hub is open (and pinned) while reading the DM.
  useRightSidebar().setPinned(true);
  useRightSidebar().setRightSidebarOpen(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useRightSidebar().setRightSidebarOpen(false);
});

async function mountLink() {
  const router = makeRouter();
  await router.push("/");
  await router.isReady();
  const { default: ChatDirectProfileLink } = await import(
    "../../components/chat/ChatDirectProfileLink.vue"
  );
  const wrapper = mount(ChatDirectProfileLink, {
    attachTo: document.body,
    props: { steamId: OTHER, name: "Opponent", subtitle: "Private message" },
    // NuxtLink resolves to vue-router's RouterLink for internal routes.
    global: { plugins: [router], components: { NuxtLink: RouterLink } },
  });
  return { wrapper, router };
}

describe("ChatDirectProfileLink", () => {
  it("makes avatar and name one clickable link to the right player", async () => {
    const { wrapper } = await mountLink();
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    expect(link.element.tagName).toBe("A");
    expect(link.find('[data-testid="dm-avatar"]').attributes("data-steam-id")).toBe(OTHER);
    expect(link.text()).toContain("Opponent");
    expect(link.text()).toContain("Private message");
    expect(link.attributes("href")).toBe(`/players/${OTHER}`);
    expect(link.attributes("aria-label")).toBe("View Opponent's profile");
    wrapper.unmount();
  });

  it("navigates in the same context: no new tab, no window.open, no absolute URL", async () => {
    const { wrapper, router } = await mountLink();
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    expect(link.attributes("target")).toBeUndefined();
    expect(link.attributes("href")).not.toMatch(/^[a-z]+:\/\//i);

    await link.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("players-id");
    expect(router.currentRoute.value.params.id).toBe(OTHER);
    expect(openSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("is keyboard accessible as a native focusable link", async () => {
    const { wrapper, router } = await mountLink();
    const el = wrapper.get('[data-testid="chat-direct-profile-link"]').element as HTMLAnchorElement;
    el.focus();
    expect(document.activeElement).toBe(el);
    expect(el.className).toContain("focus-visible:ring-2");
    // Enter on a focused <a href> fires its click; simulate that activation.
    el.click();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/players/${OTHER}`);
    wrapper.unmount();
  });

  it("desktop: opens the profile and leaves the Chat Hub as it is", async () => {
    setViewport(false);
    const { wrapper, router } = await mountLink();
    await wrapper.get('[data-testid="chat-direct-profile-link"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/players/${OTHER}`);
    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useRightSidebar().isPinned.value).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("mobile: closes the Chat Hub first, then navigates in the same context", async () => {
    setViewport(true);
    const { wrapper, router } = await mountLink();
    let hubOpenWhenNavigating: boolean | null = null;
    router.beforeEach(() => {
      hubOpenWhenNavigating = useRightSidebar().rightSidebarOpen.value;
    });
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    expect(link.attributes("target")).toBeUndefined();

    await link.trigger("click");
    await flushPromises();

    expect(hubOpenWhenNavigating).toBe(false);
    expect(router.currentRoute.value.name).toBe("players-id");
    expect(router.currentRoute.value.params.id).toBe(OTHER);
    // The Hub's own close also unpins, so the mobile layout does not reopen it.
    expect(useRightSidebar().rightSidebarOpen.value).toBe(false);
    expect(useRightSidebar().isPinned.value).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("mobile: keyboard activation closes the Hub and navigates too", async () => {
    setViewport(true);
    const { wrapper, router } = await mountLink();
    const el = wrapper.get('[data-testid="chat-direct-profile-link"]').element as HTMLAnchorElement;
    el.focus();
    el.click();
    await flushPromises();
    expect(useRightSidebar().rightSidebarOpen.value).toBe(false);
    expect(router.currentRoute.value.fullPath).toBe(`/players/${OTHER}`);
    wrapper.unmount();
  });

  it("uses the internal named route only (website stays website, app stays app)", () => {
    const src = read("components/chat/ChatDirectProfileLink.vue");
    expect(src).toContain("name: 'players-id'");
    expect(src).not.toContain('target="_blank"');
    expect(src).not.toContain("window.open");
    expect(src).not.toMatch(/https?:\/\//);
    expect(src).not.toContain("external");
    // Closes through the Hub's existing state path, nothing new.
    expect(src).toContain("if (isMobileChatHubLayout()) setRightSidebarOpen(false);");
  });
});

describe("ChatPanel header wiring", () => {
  const panel = read("components/hub/ChatPanel.vue");

  it("renders the profile link only for direct-message rooms", () => {
    expect(panel).toMatch(
      /<ChatDirectProfileLink\s+v-if="activeTab\?\.type === 'direct' && activeTab\.otherSteamId"\s+:steam-id="activeTab\.otherSteamId"/,
    );
    // Every other room keeps the existing plain title block.
    expect(panel).toMatch(/<div v-else class="min-w-0">\s+<div class="text-xs font-semibold text-foreground truncate">/);
  });

  it("leaves room switching and pop-out unchanged", () => {
    expect(panel).toContain('@click="onTabClick(tab)"');
    expect(panel).toContain('name: "chat-tabId"');
  });
});
