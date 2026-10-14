import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import fs from "node:fs";
import path from "node:path";
import en from "../../i18n/locales/en.json";

// The top navigation account menu (5Stack's ProfileMenu, DEAFCS rows).

vi.mock("@/components/ui/dropdown-menu", async () => {
  const { defineComponent, h } = await import("vue");
  const pass = (tag: string) =>
    defineComponent({
      inheritAttrs: false,
      setup:
        (_p, { slots, attrs }) =>
        () =>
          h(tag, attrs, slots.default?.()),
    });
  return {
    DropdownMenu: pass("div"),
    DropdownMenuTrigger: pass("div"),
    DropdownMenuContent: pass("div"),
    DropdownMenuItem: defineComponent({
      inheritAttrs: false,
      props: ["asChild"],
      emits: ["click"],
      setup:
        (props, { slots, attrs, emit }) =>
        () =>
          props.asChild
            ? h("div", attrs, slots.default?.())
            : h(
                "div",
                { ...attrs, role: "menuitem", onClick: () => emit("click") },
                slots.default?.(),
              ),
    }),
  };
});
vi.mock("~/components/PlayerDisplay.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["player"],
      setup: (props) => () =>
        h("span", { "data-player": props.player?.steam_id }, props.player?.name),
    }),
  };
});

vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => (globalThis as any).useAuthStore(),
}));

import ProfileMenu from "../../layouts/components/ProfileMenu.vue";

const t = (key: string) =>
  key.split(".").reduce((obj: any, part) => obj?.[part], en) ?? key;

const NuxtLink = defineComponent({
  props: ["to"],
  setup:
    (props, { slots, attrs }) =>
    () =>
      h(
        "a",
        {
          ...attrs,
          href:
            typeof props.to === "string" ? props.to : `name:${props.to?.name}`,
        },
        slots.default?.(),
      ),
});

let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  vi.stubGlobal("useAuthStore", () => ({
    me: { steam_id: "76561198000000001", name: "Anders" },
  }));
  vi.stubGlobal("useRoute", () => ({ name: "play" }));
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});

const mountMenu = () =>
  (wrapper = mount(ProfileMenu, {
    props: { open: true },
    slots: { trigger: "<button>me</button>" },
    global: { mocks: { $t: t }, stubs: { NuxtLink } },
  }));

describe("top navigation profile menu", () => {
  it("keeps My Settings, My Support Requests and Logout, in that order", () => {
    const w = mountMenu();
    const rows = w
      .findAll("[data-profile-row]")
      .map((row) => row.attributes("data-profile-row"));
    expect(rows).toEqual(["settings", "support", "logout"]);
    expect(w.get('[data-profile-row="settings"]').attributes("href")).toBe(
      "name:settings",
    );
    expect(w.get('[data-profile-row="support"]').attributes("href")).toBe(
      "/support",
    );
    expect(w.get('[data-profile-row="support"]').text()).toContain(
      "My Support Requests",
    );
  });

  it("has no Help & FAQ row (upstream's), and no install row", () => {
    const w = mountMenu();
    expect(w.text()).not.toMatch(/FAQ|Help/);
    expect(w.find('a[href="name:faq"]').exists()).toBe(false);
    expect(w.html()).not.toContain("pwa");
  });

  it("is upstream's grey panel with the player's identity card and View profile", () => {
    const w = mountMenu();
    const panel = w.get("[data-profile-menu]");
    expect(panel.classes()).toContain("bg-popover/95");
    expect(panel.classes().join(" ")).not.toContain("bg-topnav");
    expect(w.get("[data-profile-identity]").text()).toContain("Anders");
    expect(w.text()).toContain("View profile");
    expect(w.text()).toContain("Account");
  });

  it("Logout asks TopNav to open its logout dialog", async () => {
    const w = mountMenu();
    await w.get('[data-profile-row="logout"]').trigger("click");
    expect(w.emitted("logout")).toHaveLength(1);
  });

  it("TopNav uses the shared menu, not its own inline copy", () => {
    const topNav = fs.readFileSync(
      path.resolve(__dirname, "../../layouts/components/TopNav.vue"),
      "utf8",
    );
    expect(topNav).toContain('import ProfileMenu from "./ProfileMenu.vue";');
    expect(topNav).toContain('@logout="showLogoutModal = true"');
    expect(topNav).not.toContain('<DropdownMenu v-model:open="profileMenuOpen">');
  });
});
