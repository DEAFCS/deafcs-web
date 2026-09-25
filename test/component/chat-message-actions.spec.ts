import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatMessage from "../../components/chat/ChatMessage.vue";
import ChatMessageActionsMenu from "../../components/chat/ChatMessageActionsMenu.vue";
import {
  CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS,
  getChatMessageActionPermissions,
} from "../../utils/chatMessageActions";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const MINUTE = 60 * 1000;
const ME = "76561190000000001";
const OTHER = "76561190000000002";
const messageId = "123e4567-e89b-42d3-a456-426614174000";

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: messageId,
    message: "hello",
    timestamp: new Date(NOW - 2 * MINUTE).toISOString(),
    source: "website",
    from: { steam_id: ME, name: "Me", role: "verified_user" },
    ...overrides,
  };
}

const own = (overrides: Record<string, unknown> = {}) => message(overrides);
const others = (overrides: Record<string, unknown> = {}) =>
  message({
    from: { steam_id: OTHER, name: "Other", role: "verified_user" },
    ...overrides,
  });
const old = { timestamp: new Date(NOW - 11 * MINUTE).toISOString() };

function permissions(
  msg: Record<string, unknown>,
  isAdministrator: boolean,
  chatType = "global",
) {
  return getChatMessageActionPermissions({
    message: msg,
    chatType,
    viewerSteamId: ME,
    isAdministrator,
    now: NOW,
  });
}

describe("chat message action permissions", () => {
  it.each([
    ["normal user, own <=10 min", own(), false, { canEdit: true, canDelete: true, canMute: false }],
    ["normal user, own >10 min", own(old), false, { canEdit: false, canDelete: false, canMute: false }],
    ["normal user, someone else's", others(), false, { canEdit: false, canDelete: false, canMute: false }],
    ["admin, someone else's", others(), true, { canEdit: false, canDelete: true, canMute: true }],
    ["admin, someone else's old", others(old), true, { canEdit: false, canDelete: true, canMute: true }],
    ["admin, own <=10 min", own(), true, { canEdit: true, canDelete: true, canMute: false }],
    ["admin, own >10 min", own(old), true, { canEdit: false, canDelete: true, canMute: false }],
  ])("%s", (_label, msg, isAdministrator, expected) => {
    expect(permissions(msg, isAdministrator)).toEqual(expected);
  });

  it("matches the API boundary: exactly 10 minutes is allowed, 1 ms later is not", () => {
    const at = (age: number) =>
      own({ timestamp: new Date(NOW - age).toISOString() });
    expect(permissions(at(CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS), false).canEdit).toBe(true);
    expect(permissions(at(CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS + 1), false).canEdit).toBe(false);
  });

  it("hides self Edit/Delete for an invalid or missing timestamp", () => {
    for (const timestamp of ["not-a-date", undefined, null, ""]) {
      expect(permissions(own({ timestamp }), false)).toEqual({
        canEdit: false,
        canDelete: false,
        canMute: false,
      });
    }
  });

  it("never offers Edit on a Short Video, but allows own recent delete", () => {
    const video = own({ message: "", media: { type: "video", id: "m-1" } });
    expect(permissions(video, false)).toEqual({
      canEdit: false,
      canDelete: true,
      canMute: false,
    });
    expect(permissions(others({ message: "", media: { type: "video", id: "m-1" } }), false))
      .toEqual({ canEdit: false, canDelete: false, canMute: false });
  });

  it("gives system/game/legacy messages no Edit and no invented ownership", () => {
    const shapes = [
      own({ source: "game" }),
      own({ source: undefined }),
      message({ from: { name: "System" } }),
      message({ from: undefined }),
      own({ blocked: true }),
    ];
    for (const shape of shapes) {
      expect(permissions(shape, false)).toEqual({
        canEdit: false,
        canDelete: false,
        canMute: false,
      });
      const admin = permissions(shape, true);
      expect(admin.canEdit).toBe(false);
      // Existing moderation reach: an administrator may still try Delete,
      // the API decides whether the stored shape is auditable.
      expect(admin.canDelete).toBe(true);
    }
    expect(permissions(message({ from: { name: "System" } }), true).canMute).toBe(false);
  });

  it("offers nothing without a message id", () => {
    expect(permissions(own({ id: undefined }), true)).toEqual({
      canEdit: false,
      canDelete: false,
      canMute: false,
    });
  });

  it("announcements: author admin may edit within 10 minutes, nobody else may", () => {
    const announcement = (overrides = {}) => {
      const { source: _source, ...rest } = own(overrides);
      return rest;
    };
    expect(permissions(announcement(), true, "announcement").canEdit).toBe(true);
    expect(permissions(announcement(old), true, "announcement").canEdit).toBe(false);
    expect(
      permissions(
        { ...announcement(), from: { steam_id: OTHER } },
        true,
        "announcement",
      ),
    ).toEqual({ canEdit: false, canDelete: true, canMute: true });
    // Posting/editing announcements stays administrator-only.
    expect(permissions(announcement(), false, "announcement").canEdit).toBe(false);
  });
});

describe("ChatMessage wires the permissions into the ... menu", () => {
  let isAdministrator = false;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    isAdministrator = false;
    vi.stubGlobal("useAuthStore", () => ({
      me: { steam_id: ME },
      isRoleAbove: () => isAdministrator,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountMessage(props: Record<string, unknown>) {
    return mount(ChatMessage, {
      props: { chatType: "global", reactionsEnabled: true, ...props },
      global: {
        mocks: {
          $t: (key: string, fallback?: string) => fallback ?? key,
          $apollo: { query: vi.fn().mockResolvedValue({ data: {} }) },
        },
        stubs: {
          TimeAgo: true,
          PlayerDisplay: true,
          FiveStackToolTip: true,
          ChatMessageActionsMenu: true,
          ChatVideoPlayer: true,
        },
      },
    });
  }

  const menuProps = (wrapper: ReturnType<typeof mountMessage>) => {
    const menu = wrapper.findComponent(ChatMessageActionsMenu);
    return {
      canReact: menu.props("canReact"),
      canEdit: menu.props("canEdit"),
      canDelete: menu.props("canDelete"),
      canMute: menu.props("canMute"),
    };
  };

  it("own recent message: React, Edit, Delete", () => {
    const wrapper = mountMessage({ message: own() });
    expect(menuProps(wrapper)).toEqual({
      canReact: true,
      canEdit: true,
      canDelete: true,
      canMute: false,
    });
  });

  it("admin on someone else's message: React, Mute, Delete, never Edit", () => {
    isAdministrator = true;
    const wrapper = mountMessage({ message: others() });
    expect(menuProps(wrapper)).toEqual({
      canReact: true,
      canEdit: false,
      canDelete: true,
      canMute: true,
    });
  });

  it("drops own Edit/Delete once the 10-minute window closes, without a reload", async () => {
    const wrapper = mountMessage({
      message: own({ timestamp: new Date(NOW - 9 * MINUTE).toISOString() }),
    });
    expect(menuProps(wrapper).canEdit).toBe(true);

    vi.advanceTimersByTime(MINUTE + 100);
    await wrapper.vm.$nextTick();
    expect(menuProps(wrapper)).toEqual({
      canReact: true,
      canEdit: false,
      canDelete: false,
      canMute: false,
    });
  });

  it("re-evaluates age when the menu is opened", async () => {
    const wrapper = mountMessage({
      message: own({ timestamp: new Date(NOW - 9 * MINUTE).toISOString() }),
    });
    vi.setSystemTime(NOW + 2 * MINUTE);
    wrapper.findComponent(ChatMessageActionsMenu).vm.$emit("opened");
    await wrapper.vm.$nextTick();
    expect(menuProps(wrapper).canEdit).toBe(false);
  });

  it("match page (reactions off): own old message and others' messages get no menu at all", () => {
    const ownOld = mountMessage({ message: own(old), reactionsEnabled: false });
    expect(ownOld.findComponent(ChatMessageActionsMenu).exists()).toBe(false);
    const other = mountMessage({ message: others(), reactionsEnabled: false });
    expect(other.findComponent(ChatMessageActionsMenu).exists()).toBe(false);
  });

  it("emits edit-message for the stable id only", async () => {
    const wrapper = mountMessage({ message: own() });
    wrapper.findComponent(ChatMessageActionsMenu).vm.$emit("edit");
    await wrapper.vm.$nextTick();
    const textarea = wrapper.get("textarea");
    expect(textarea.attributes("maxlength")).toBe("2000");
    await textarea.setValue("fixed");
    await textarea.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("edit-message")?.[0]?.[0]).toEqual({
      id: messageId,
      message: "fixed",
    });
  });
});

describe("ChatMessageActionsMenu renders exactly the allowed items", () => {
  const passthrough = { template: "<div><slot /></div>" };
  function mountMenu(props: Record<string, boolean>) {
    return mount(ChatMessageActionsMenu, {
      props: { canEdit: false, canDelete: false, canMute: false, ...props },
      global: {
        mocks: { $t: (key: string, fallback?: string) => fallback ?? key },
        stubs: {
          DropdownMenu: passthrough,
          DropdownMenuTrigger: passthrough,
          DropdownMenuContent: passthrough,
          DropdownMenuSub: passthrough,
          DropdownMenuSubTrigger: passthrough,
          DropdownMenuSubContent: passthrough,
          DropdownMenuItem: {
            template: '<button type="button" v-bind="$attrs"><slot /></button>',
          },
        },
      },
    });
  }

  it("normal user, own old message: React only", () => {
    const text = mountMenu({ canReact: true }).text();
    expect(text).toContain("React");
    expect(text).not.toContain("common.edit");
    expect(text).not.toContain("common.delete");
    expect(text).not.toContain("Mute Player");
  });

  it("admin, someone else's: React, Mute, Delete, no Edit", async () => {
    const menu = mountMenu({ canReact: true, canMute: true, canDelete: true });
    const text = menu.text();
    expect(text).toContain("React");
    expect(text).toContain("Mute Player");
    expect(text).toContain("common.delete");
    expect(text).not.toContain("common.edit");
    expect(menu.findAll('[aria-label^="React with"]')).toHaveLength(4);
  });

  it("own recent: React, Edit, Delete, no Mute", () => {
    const text = mountMenu({ canReact: true, canEdit: true, canDelete: true }).text();
    expect(text).toContain("common.edit");
    expect(text).toContain("common.delete");
    expect(text).not.toContain("Mute Player");
  });
});
