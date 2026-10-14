import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
  computed,
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  reactive,
  defineComponent,
} from "vue";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import da from "../../i18n/locales/da_DK.json";
import fs from "node:fs";
import ProfileSettingsShell from "../../components/settings/ProfileSettingsShell.vue";
import BlockedPlayers from "../../pages/settings/blocked-players.vue";
const state = vi.hoisted(() => ({
  query: vi.fn(),
  unblock: vi.fn(),
  busy: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({ client: { query: state.query } }),
}));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));
const t = (key: string, fallback?: string) =>
  key.split(".").reduce((obj: any, part) => obj?.[part], en) ?? fallback ?? key;
vi.mock("vue-i18n", async (original) => ({
  ...(await original<typeof import("vue-i18n")>()),
  useI18n: () => ({ t }),
}));
let wrapper: VueWrapper | undefined;
let blocks: any;
const Slot = defineComponent({ template: "<div><slot /></div>" });
beforeEach(() => {
  blocks = reactive([]);
  state.query.mockResolvedValue({
    data: { players_by_pk: { api_key_enabled: false } },
  });
  state.busy.mockReturnValue(false);
  state.unblock.mockResolvedValue(undefined);
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    onMounted,
    onUnmounted,
    nextTick,
    useI18n: () => ({ t }),
    useWebsiteRestrictionStore: () => ({ isRestricted: false }),
      useAuthStore: () => ({ me: { steam_id: "1" }, hasDiscordLinked: false }),
    useApplicationSettingsStore: () => ({
      showSeparators: false,
      supportsDiscordBot: false,
    }),
    useRoute: () => ({ path: "/settings/blocked-players" }),
    useRouter: () => ({ push: state.push }),
    useBlockStore: () => ({ blocked: blocks }),
    useBlockActions: () => ({
      unblockPlayer: state.unblock,
      isBusy: state.busy,
    }),
  }))
    vi.stubGlobal(name, value);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const blockedPage = () =>
  mount(BlockedPlayers, {
    global: {
      mocks: { $t: t },
      stubs: {
        PageTransition: Slot,
        MessageRequestsSetting: {
          template: '<section aria-label="Message Requests" />',
        },
        PlayerDisplay: {
          props: ["player"],
          template: "<span>{{ player.name }}</span>",
        },
      },
    },
  });
describe("compact upstream account settings", () => {
  it.each([390, 1440])(
    "retains account navigation and bounded content at %spx",
    async (width) => {
      window.innerWidth = width;
      wrapper = mount(ProfileSettingsShell, {
        slots: {
          default: '<section data-test="content">Account content</section>',
        },
        global: {
          mocks: { $t: t },
          stubs: {
            NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
            TacticalPageHeader: {
              template:
                '<header><slot name="title" /><slot name="subtitle" /></header>',
            },
          },
        },
      });
      await flushPromises();
      expect(wrapper.text()).toContain("Account Settings");
      expect(
        wrapper
          .find('[data-test="content"]')
          .element.parentElement?.classList.contains("max-w-4xl"),
      ).toBe(true);
      expect(wrapper.get("nav").attributes("aria-label")).toBe(
        "Settings section",
      );
      expect(
        wrapper
          .get('a[href="/settings/blocked-players"]')
          .attributes("aria-current"),
      ).toBe("page");
      expect(wrapper.find('[role="combobox"]').exists()).toBe(true);
      expect(wrapper.text()).toContain("Linked Accounts");
    },
  );
  it("shows the bounded upstream empty state without unblock controls", () => {
    wrapper = blockedPage();
    expect(wrapper.text()).toContain("No blocked players");
    expect(wrapper.text()).toContain("Players you block will appear here.");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Message Requests"]').exists()).toBe(true);
  });
  it("renders compact rows and disables unblock while an action is pending", async () => {
    blocks.push({ steam_id: "2", name: "Synthetic blocked player" });
    state.busy.mockReturnValue(true);
    wrapper = blockedPage();
    expect(wrapper.findAll("li")).toHaveLength(1);
    expect(wrapper.text()).toContain("Synthetic blocked player");
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await wrapper.get("button").trigger("click");
    expect(state.unblock).not.toHaveBeenCalled();
  });
  it("keeps the existing unblock action wired to the selected player", async () => {
    blocks.push({ steam_id: "2", name: "Synthetic blocked player" });
    wrapper = blockedPage();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(state.unblock).toHaveBeenCalledWith("2");
  });
});
describe("profile follow-up translations", () => {
  it.each(["en", "da_DK"])(
    "resolves readable block labels and the interpolated ELO tooltip in %s",
    (locale) => {
      const i18n = createI18n({
        legacy: false,
        locale,
        fallbackLocale: "en",
        messages: { en, da_DK: da },
      });
      expect(
        i18n.global.t("pages.players.detail.recent_form_elo", { count: 12 }),
      ).toContain("12");
      for (const key of ["block_player", "unblock_player"])
        expect(i18n.global.t("pages.players.detail." + key)).not.toContain(
          "pages.players.detail.",
        );
    },
  );
  it("resolves header/action keys for every supported locale with the existing English fallback", () => {
    const keys = [
      "recent_form_elo",
      "block_player",
      "unblock_player",
      "more_actions",
      "friend",
      "edit_player",
      "message_requests_disabled",
    ];
    for (const file of fs
      .readdirSync("i18n/locales")
      .filter((f) => f.endsWith(".json"))) {
      const locale = file.replace(".json", "");
      const messages = JSON.parse(
        fs.readFileSync("i18n/locales/" + file, "utf8"),
      );
      const i18n = createI18n({
        legacy: false,
        locale,
        fallbackLocale: "en",
        missingWarn: false,
        fallbackWarn: false,
        messages: { en, [locale]: messages },
      });
      for (const key of keys) {
        const path = "pages.players.detail." + key;
        expect(i18n.global.t(path, { count: 12 })).not.toBe(path);
      }
    }
  });
});
