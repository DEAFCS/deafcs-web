import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterLink } from "vue-router";
import fs from "node:fs";
import path from "node:path";
import {
  MOBILE_CHAT_HUB_QUERY,
  useRightSidebar,
} from "../../composables/useRightSidebar";

// Private message header, ported from 5Stack's hub header (upstream
// ba0628b2): a round avatar link and a name link that turns amber on hover,
// with the subtitle underneath. Both open the player's profile with
// same-context internal routing (the NuxtLink/players-id pattern from
// PlayerDisplay and Captain Pick), never a new tab, a window.open or an
// absolute URL that could hand the site off to the app. No card, background
// or tooltip is involved, so there is nothing that can stay stuck.

vi.mock("~/components/LiveAvatarImg.vue", () => ({
  default: defineComponent({
    props: ["steamId", "fallbackUrl"],
    setup: (props) => () =>
      h("img", { "data-testid": "dm-avatar", "data-steam-id": props.steamId }),
  }),
}));

const OTHER = "76561190000000002";
const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

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
  const { default: ChatDirectProfileLink } =
    await import("../../components/chat/ChatDirectProfileLink.vue");
  const wrapper = mount(ChatDirectProfileLink, {
    attachTo: document.body,
    props: { steamId: OTHER, name: "Opponent", subtitle: "Private message" },
    // NuxtLink resolves to vue-router's RouterLink for internal routes.
    global: { plugins: [router], components: { NuxtLink: RouterLink } },
  });
  return { wrapper, router };
}

describe("ChatDirectProfileLink", () => {
  it("links both the avatar and the name to the right player", async () => {
    const { wrapper } = await mountLink();
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    const avatar = wrapper.get('[data-testid="chat-direct-profile-avatar"]');
    expect(link.element.tagName).toBe("A");
    expect(avatar.element.tagName).toBe("A");
    expect(
      avatar.find('[data-testid="dm-avatar"]').attributes("data-steam-id"),
    ).toBe(OTHER);
    expect(link.text()).toBe("Opponent");
    expect(link.attributes("href")).toBe(`/players/${OTHER}`);
    expect(avatar.attributes("href")).toBe(`/players/${OTHER}`);
    expect(link.attributes("aria-label")).toBe("View Opponent's profile");
    // The subtitle keeps saying what the conversation is, outside the link.
    expect(wrapper.text()).toContain("Private message");
    expect(link.text()).not.toContain("Private message");
    wrapper.unmount();
  });

  it("is one keyboard stop: the avatar is a mouse-only duplicate of the name link", async () => {
    const { wrapper } = await mountLink();
    const avatar = wrapper.get('[data-testid="chat-direct-profile-avatar"]');
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    expect(avatar.attributes("tabindex")).toBe("-1");
    expect(avatar.attributes("aria-hidden")).toBe("true");
    expect(link.attributes("tabindex")).toBeUndefined();
    wrapper.unmount();
  });

  it("uses 5Stack's hover: the name turns amber and underlines, the avatar gets an amber ring, no card", async () => {
    const { wrapper } = await mountLink();
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    const avatar = wrapper.get('[data-testid="chat-direct-profile-avatar"]');
    expect(link.classes()).toContain("hover:text-[hsl(var(--tac-amber))]");
    expect(link.classes()).toContain("hover:underline");
    expect(link.classes()).toContain("focus-visible:ring-2");
    expect(avatar.classes()).toContain("hover:ring-2");
    expect(avatar.classes()).toContain("rounded-full");
    // The old DEAFCS block highlight that read as a separate profile card.
    for (const el of [link, avatar, wrapper.get('[data-testid="chat-direct-profile"]')]) {
      expect(el.classes().join(" ")).not.toMatch(/hover:bg-|-m-1|dm-profile/);
    }
    wrapper.unmount();
  });

  it("every press on avatar or name navigates to the same profile", async () => {
    const { wrapper, router } = await mountLink();
    await wrapper
      .get('[data-testid="chat-direct-profile-avatar"]')
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/players/${OTHER}`);
    await router.push("/");
    await wrapper
      .get('[data-testid="chat-direct-profile-link"]')
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/players/${OTHER}`);
    expect(wrapper.emitted("navigate")).toHaveLength(2);
    wrapper.unmount();
  });

  it("navigates in the same context: no new tab, no window.open, no absolute URL", async () => {
    const { wrapper, router } = await mountLink();
    const link = wrapper.get('[data-testid="chat-direct-profile-link"]');
    expect(link.attributes("target")).toBeUndefined();
    expect(link.attributes("href")).not.toMatch(/^[a-z]+:\/\//i);

    await link.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("navigate")).toHaveLength(1);
    expect(router.currentRoute.value.name).toBe("players-id");
    expect(router.currentRoute.value.params.id).toBe(OTHER);
    expect(openSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("is keyboard accessible as a native focusable link", async () => {
    const { wrapper, router } = await mountLink();
    const el = wrapper.get('[data-testid="chat-direct-profile-link"]')
      .element as HTMLAnchorElement;
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
    await wrapper
      .get('[data-testid="chat-direct-profile-link"]')
      .trigger("click");
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
    // Closing the mobile panel preserves the saved pin independently.
    expect(useRightSidebar().rightSidebarOpen.value).toBe(false);
    expect(useRightSidebar().isPinned.value).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("mobile: keyboard activation closes the Hub and navigates too", async () => {
    setViewport(true);
    const { wrapper, router } = await mountLink();
    const el = wrapper.get('[data-testid="chat-direct-profile-link"]')
      .element as HTMLAnchorElement;
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
    // No leftover floating card, tooltip or popover behind the header.
    expect(src).not.toMatch(/Tooltip|Popover|HoverCard/);
    expect(src).not.toContain('target="_blank"');
    expect(src).not.toContain("window.open");
    expect(src).not.toMatch(/https?:\/\//);
    expect(src).not.toContain("external");
    // Closes through the Hub's existing state path, nothing new.
    expect(src).toContain(
      "if (isMobileChatHubLayout()) setRightSidebarOpen(false);",
    );
  });
});

describe("ChatPanel header wiring", () => {
  const panel = read("components/hub/ChatPanel.vue");

  it("renders the profile link only for direct-message rooms", () => {
    expect(panel).toMatch(
      /<ChatDirectProfileLink\s+v-if="activeTab\?\.type === 'direct' && activeTab\.otherSteamId"\s+:steam-id="activeTab\.otherSteamId"/,
    );
    // Every other room keeps the existing plain title block.
    expect(panel).toMatch(
      /<template v-else>[\s\S]*?<div class="min-w-0">\s+<div class="text-xs font-semibold text-foreground truncate">/,
    );
  });

  it("leaves room switching and pop-out unchanged", () => {
    expect(panel).toContain('@click="onTabClick(tab)"');
    expect(panel).toContain('name: "chat-tabId"');
  });
});
