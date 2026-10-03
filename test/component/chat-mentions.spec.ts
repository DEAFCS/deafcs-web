import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import ChatMessage from "../../components/chat/ChatMessage.vue";
import ChatInput from "../../components/chat/ChatInput.vue";
import { useChatTabs } from "../../composables/useChatTabs";
import { formatBadgeCount } from "../../utilities/formatBadgeCount";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

const ME = "76561190000000123";
const OTHER = "76561190000000456";

const baseMessage = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  from: { steam_id: OTHER, name: "Sender", role: "verified_user" },
  timestamp: "2026-10-03T12:00:00.000Z",
};

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useAuthStore", () => ({
    me: { steam_id: ME },
    isRoleAbove: () => false,
  }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const mountMessage = (message: Record<string, unknown>) =>
  mount(ChatMessage, {
    props: { message, chatType: "global" },
    global: {
      mocks: { $t: (key: string, fallback?: string) => fallback ?? key },
      stubs: {
        TimeAgo: true,
        PlayerDisplay: true,
        FiveStackToolTip: true,
        ChatMessageActionsMenu: true,
      },
    },
  });

describe("@mention highlighting in ChatMessage", () => {
  it("highlights tagged names, red when it is me", () => {
    const wrapper = mountMessage({
      ...baseMessage,
      message: "hey @Neo and @Zombies Mustafa, gg",
      mentions: [
        { steam_id: ME, name: "Neo" },
        { steam_id: "76561190000000789", name: "Zombies Mustafa" },
      ],
    });

    const tags = wrapper.findAll("p span");
    expect(tags.map((tag) => tag.text())).toEqual([
      "@Neo",
      "@Zombies Mustafa",
    ]);
    expect(tags[0].classes()).toContain("text-red-300");
    expect(tags[1].classes()).toContain("text-primary");
    // The visible text is unchanged by the highlighting.
    expect(wrapper.get("p").text()).toBe("hey @Neo and @Zombies Mustafa, gg");
    wrapper.unmount();
  });

  it("leaves an @name that was not accepted as a mention as plain text", () => {
    const wrapper = mountMessage({
      ...baseMessage,
      message: "hey @Stranger",
    });
    expect(wrapper.findAll("p span")).toHaveLength(0);
    expect(wrapper.get("p").text()).toBe("hey @Stranger");
    wrapper.unmount();
  });

  it("does not treat regex characters in a name as a pattern", () => {
    const wrapper = mountMessage({
      ...baseMessage,
      message: "yo @a.b(c) there",
      mentions: [{ steam_id: ME, name: "a.b(c)" }],
    });
    expect(wrapper.findAll("p span").map((tag) => tag.text())).toEqual([
      "@a.b(c)",
    ]);
    wrapper.unmount();
  });
});

describe("badge count cap", () => {
  it("shows exact counts up to 99 and 99+ beyond", () => {
    expect(formatBadgeCount(0)).toBe("0");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(2500)).toBe("99+");
  });
});

describe("mention counts in useChatTabs", () => {
  it("counts mentions per tab and clears them together with unread", () => {
    const tabs = useChatTabs();
    tabs.clearAll();

    tabs.incrementUnread("global");
    tabs.incrementUnread("global");
    tabs.incrementMention("global");
    expect(tabs.unreadCounts.value.global).toBe(2);
    expect(tabs.mentionCounts.value.global).toBe(1);
    expect(JSON.parse(localStorage.getItem("chat-mention-counts")!)).toEqual({
      global: 1,
    });

    tabs.resetUnread("global");
    expect(tabs.unreadCounts.value.global).toBe(0);
    expect(tabs.mentionCounts.value.global).toBe(0);

    tabs.incrementMention("tournament:t1");
    tabs.clearUnread("tournament:t1");
    expect(tabs.mentionCounts.value["tournament:t1"]).toBeUndefined();

    tabs.incrementMention("team:x");
    tabs.setUnread("team:x", 0);
    expect(tabs.mentionCounts.value["team:x"]).toBe(0);

    tabs.incrementMention("global");
    tabs.clearAll();
    expect(tabs.mentionCounts.value).toEqual({});
    expect(localStorage.getItem("chat-mention-counts")).toBeNull();
  });
});

describe("@ picker in ChatInput", () => {
  const hits = [
    {
      document: { steam_id: "76561190000000789", name: "Neo", avatar_url: "" },
    },
    {
      document: { steam_id: "76561190000000790", name: "Neon", avatar_url: "" },
    },
  ];

  const mountInput = (chatType: string) => {
    vi.stubGlobal("$fetch", vi.fn().mockResolvedValue({ hits }));
    return mount(ChatInput, {
      props: { variant: "global", chatType, roomId: "room" },
      global: {
        mocks: { $t: (key: string, fallback?: string) => fallback ?? key },
        stubs: { ChatComposerMenu: true, ChatVideoComposer: true },
      },
    });
  };

  const type = async (
    wrapper: ReturnType<typeof mountInput>,
    value: string,
  ) => {
    const textarea = wrapper.get("textarea");
    (textarea.element as HTMLTextAreaElement).value = value;
    (textarea.element as HTMLTextAreaElement).setSelectionRange(
      value.length,
      value.length,
    );
    await textarea.trigger("input");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flushPromises();
    await nextTick();
  };

  it("lists registered players after @ and submits the picked steam id", async () => {
    const wrapper = mountInput("global");

    await type(wrapper, "hi @ne");
    expect(wrapper.findAll("[role=option] .truncate").map((o) => o.text())).toEqual([
      "Neo",
      "Neon",
    ]);
    // Registered players only, no online/offline filtering or status text.
    expect((globalThis.$fetch as any).mock.calls[0][1].body).toMatchObject({
      registeredOnly: true,
      query: "ne",
    });

    await wrapper.get("textarea").trigger("keydown", { key: "ArrowDown" });
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    await nextTick();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "hi @Neon ",
    );
    expect(wrapper.find("[role=listbox]").exists()).toBe(false);
    // Enter chose a player instead of sending.
    expect(wrapper.emitted("sendMessage")).toBeUndefined();

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.emitted("sendMessage")![0][0]).toMatchObject({
      message: "hi @Neon",
      mentions: ["76561190000000790"],
    });
  });

  it("drops a pick whose @name was edited out of the text", async () => {
    const wrapper = mountInput("global");
    await type(wrapper, "@ne");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    await nextTick();

    (wrapper.get("textarea").element as HTMLTextAreaElement).value = "never mind";
    await wrapper.get("textarea").trigger("input");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.emitted("sendMessage")![0][0]).toMatchObject({
      message: "never mind",
      mentions: undefined,
    });
  });

  it.each(["match", "match_team", "draft", "direct", "captain_pick_team"])(
    "never opens the list in %s chat",
    async (chatType) => {
      const wrapper = mountInput(chatType);
      await type(wrapper, "@ne");
      expect(wrapper.find("[role=listbox]").exists()).toBe(false);
      expect(globalThis.$fetch).not.toHaveBeenCalled();
    },
  );
});
