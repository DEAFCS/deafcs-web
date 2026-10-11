import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import ChatMessage from "../../components/chat/ChatMessage.vue";
import ChatMessageActionsMenu from "../../components/chat/ChatMessageActionsMenu.vue";
import ChatMessageActions from "../../components/chat/ChatMessageActions.vue";
import ChatMessageEditor from "../../components/chat/ChatMessageEditor.vue";
import socket from "../../web-sockets/Socket";
import ChatInput from "../../components/chat/ChatInput.vue";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS,
  getChatMessageActionPermissions,
} from "../../utils/chatMessageActions";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast: toastMock }));

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
    [
      "normal user, own <=10 min",
      own(),
      false,
      { canEdit: true, canDelete: true, canMute: false },
    ],
    [
      "normal user, own >10 min",
      own(old),
      false,
      { canEdit: false, canDelete: false, canMute: false },
    ],
    [
      "normal user, someone else's",
      others(),
      false,
      { canEdit: false, canDelete: false, canMute: false },
    ],
    [
      "admin, someone else's",
      others(),
      true,
      { canEdit: false, canDelete: true, canMute: true },
    ],
    [
      "admin, someone else's old",
      others(old),
      true,
      { canEdit: false, canDelete: true, canMute: true },
    ],
    [
      "admin, own <=10 min",
      own(),
      true,
      { canEdit: true, canDelete: true, canMute: false },
    ],
    [
      "admin, own >10 min",
      own(old),
      true,
      { canEdit: false, canDelete: true, canMute: false },
    ],
  ])("%s", (_label, msg, isAdministrator, expected) => {
    expect(permissions(msg, isAdministrator)).toEqual(expected);
  });

  it("matches the API boundary: exactly 10 minutes is allowed, 1 ms later is not", () => {
    const at = (age: number) =>
      own({ timestamp: new Date(NOW - age).toISOString() });
    expect(
      permissions(at(CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS), false).canEdit,
    ).toBe(true);
    expect(
      permissions(at(CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS + 1), false).canEdit,
    ).toBe(false);
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

  it("never offers Edit on a message with an attachment, but allows own recent delete", () => {
    const withAttachment = own({ message: "", attachment: { id: "a-1" } });
    expect(permissions(withAttachment, false)).toEqual({
      canEdit: false,
      canDelete: true,
      canMute: false,
    });
    expect(
      permissions(others({ message: "", attachment: { id: "a-1" } }), false),
    ).toEqual({ canEdit: false, canDelete: false, canMute: false });
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
    expect(
      permissions(message({ from: { name: "System" } }), true).canMute,
    ).toBe(false);
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
    expect(permissions(announcement(), true, "announcement").canEdit).toBe(
      true,
    );
    expect(permissions(announcement(old), true, "announcement").canEdit).toBe(
      false,
    );
    expect(
      permissions(
        { ...announcement(), from: { steam_id: OTHER } },
        true,
        "announcement",
      ),
    ).toEqual({ canEdit: false, canDelete: true, canMute: true });
    // Posting/editing announcements stays administrator-only.
    expect(permissions(announcement(), false, "announcement").canEdit).toBe(
      false,
    );
  });
});

describe("ChatMessage wires the permissions into the ... menu", () => {
  let isAdministrator = false;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    isAdministrator = false;
    vi.stubGlobal("useWebsiteRestrictionStore", () => ({
      isRestricted: false,
    }));
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
    return shallowMount(ChatMessage, {
      props: {
        chatType: "global",
        room: { type: "global", id: "global" },
        canPost: true,
        canModerate: isAdministrator,
        reactionsEnabled: true,
        ...props,
      },
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
        },
      },
    });
  }

  const menuProps = (wrapper: ReturnType<typeof mountMessage>) => {
    const menu = wrapper.findComponent(ChatMessageActions);
    // The "..." menu itself no longer renders at all once canEdit/canDelete/
    // canMute are all false (nothing left to show in it) -- absence means
    // false for each, same as if it were still there with every flag off.
    return {
      // React lives in its own standalone button next to "..." now, not
      // as a prop on the menu itself.
      canReact: menu.exists() ? menu.props("permissions").canReact : false,
      canEdit: menu.exists() ? menu.props("permissions").canEdit : false,
      canDelete: menu.exists() ? menu.props("permissions").canDelete : false,
      canMute: menu.exists() ? menu.props("permissions").canSanction : false,
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
    wrapper.getComponent(ChatMessageActions).vm.$emit("open");
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
    wrapper.findComponent(ChatMessageActions).vm.$emit("open");
    await wrapper.vm.$nextTick();
    expect(menuProps(wrapper).canEdit).toBe(false);
  });

  it("match page (reactions off): own old message and others' messages get no menu at all", () => {
    const ownOld = mountMessage({ message: own(old), reactionsEnabled: false });
    expect(ownOld.findComponent(ChatMessageActions).exists()).toBe(false);
    const other = mountMessage({ message: others(), reactionsEnabled: false });
    expect(other.findComponent(ChatMessageActions).exists()).toBe(false);
  });

  it("hands the stable message to the list-owned inline editor", async () => {
    const wrapper = mountMessage({ message: own() });
    wrapper.findComponent(ChatMessageActions).vm.$emit("edit");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("edit")).toHaveLength(1);
    await wrapper.setProps({ editing: true });
    expect(wrapper.getComponent(ChatMessageEditor).props("message").id).toBe(
      messageId,
    );
    wrapper.unmount();
  });

  it("edit: exactly 2,000 characters is sent, 2,001 is refused and kept open untruncated", async () => {
    const send = vi.spyOn(socket, "editMessage").mockResolvedValue(undefined);
    vi.stubGlobal("useNuxtApp", () => ({ $i18n: { t: (key: string) => key } }));
    const wrapper = mount(ChatMessageEditor, {
      props: { message: own(), room: { type: "global", id: "global" } },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: {
          Textarea: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          Button: { template: "<button><slot /></button>" },
        },
      },
    });
    const edit = async (text: string) => {
      const textarea = wrapper.get("textarea");
      await textarea.setValue(text);
      await textarea.trigger("keydown", { key: "Enter" });
      return textarea;
    };

    const tooLong = "y".repeat(CHAT_MESSAGE_MAX_LENGTH + 1);
    const textarea = await edit(tooLong);
    expect(send).not.toHaveBeenCalled();
    expect((textarea.element as HTMLTextAreaElement).value).toBe(tooLong);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "chat.message_too_long",
      }),
    );

    const exact = "x".repeat(CHAT_MESSAGE_MAX_LENGTH);
    await wrapper.get("textarea").setValue(exact);
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    expect(send).toHaveBeenCalledWith("global", "global", messageId, exact);
    wrapper.unmount();
    send.mockRestore();
  });
});

describe("ChatInput 2,000 character limit", () => {
  beforeEach(() => {
    toastMock.mockClear();
    vi.stubGlobal("useWebsiteRestrictionStore", () => ({
      isRestricted: false,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountInput() {
    return mount(ChatInput, {
      global: {
        mocks: { $t: (key: string, fallback?: string) => fallback ?? key },
        stubs: { ChatComposerMenu: true },
      },
    });
  }

  it("sends exactly 2,000 characters", async () => {
    const wrapper = mountInput();
    const text = "a".repeat(CHAT_MESSAGE_MAX_LENGTH);
    await wrapper.get("textarea").setValue(text);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("sendMessage")?.[0]?.[0]).toEqual({
      message: text,
      attachment: undefined,
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("refuses 2,001 characters, keeps the text and explains why", async () => {
    const wrapper = mountInput();
    const text = "a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1);
    const input = wrapper.get("textarea");
    await input.setValue(text);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("sendMessage")).toBeUndefined();
    expect((input.element as HTMLTextAreaElement).value).toBe(text);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Message can be up to 2,000 characters.",
      }),
    );
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

  it("normal user, own old message: nothing to show", () => {
    const text = mountMenu({}).text();
    expect(text).not.toContain("common.edit");
    expect(text).not.toContain("common.delete");
    expect(text).not.toContain("Mute Player");
  });

  it("admin, someone else's: Mute, Delete, no Edit", async () => {
    const menu = mountMenu({ canMute: true, canDelete: true });
    const text = menu.text();
    expect(text).toContain("Mute Player");
    expect(text).toContain("common.delete");
    expect(text).not.toContain("common.edit");
  });

  it("own recent: Edit, Delete, no Mute", () => {
    const text = mountMenu({ canEdit: true, canDelete: true }).text();
    expect(text).toContain("common.edit");
    expect(text).toContain("common.delete");
    expect(text).not.toContain("Mute Player");
  });
});
