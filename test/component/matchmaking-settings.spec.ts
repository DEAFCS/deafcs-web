import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import MatchmakingSettings from "../../pages/settings/application/matchmaking.vue";
import en from "../../i18n/locales/en.json";

const mocks = vi.hoisted(() => ({
  apolloMutate: vi.fn(async () => ({})),
}));

vi.mock("~/graphql/graphqlGen", () => ({
  generateMutation: (mutation: unknown) => mutation,
}));
vi.mock("~/components/ui/switch", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    Switch: defineComponent({
      setup() {
        return () => h("span", { "data-testid": "setting-switch" });
      },
    }),
  };
});

const passthrough = (tag: string) =>
  defineComponent({
    setup:
      (_props, { attrs, slots }) =>
      () =>
        h(tag, attrs, slots.default?.()),
  });

const formField = defineComponent({
  props: ["name"],
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        { "data-field-name": props.name },
        slots.default?.({ componentField: {} }),
      );
  },
});

beforeEach(() => {
  mocks.apolloMutate.mockClear();
  vi.stubGlobal("useApplicationSettingsStore", () => ({
    settings: [],
    captainPickEnabled: false,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("application matchmaking settings", () => {
  it("shows four equal mode tiles in the requested order and keeps the timer", async () => {
    const wrapper = mount(MatchmakingSettings, {
      global: {
        stubs: {
          PageTransition: passthrough("div"),
          SettingsSaveBar: true,
          FormField: formField,
          FormItem: passthrough("div"),
          FormLabel: passthrough("label"),
          FormDescription: passthrough("p"),
          FormControl: passthrough("div"),
          FormMessage: true,
          Select: passthrough("div"),
          SelectTrigger: passthrough("div"),
          SelectValue: true,
          SelectContent: passthrough("div"),
          SelectGroup: passthrough("div"),
          SelectItem: passthrough("div"),
          Input: passthrough("input"),
          Separator: true,
        },
        plugins: [
          {
            install(app) {
              Object.assign(app.config.globalProperties, {
                $t: (key: string) =>
                  key === "matchmaking.captain_pick.title"
                    ? en.matchmaking.captain_pick.title
                    : key,
                $apollo: { mutate: mocks.apolloMutate },
              });
            },
          },
        ],
      },
    });
    await flushPromises();

    const grid = wrapper.find('[data-testid="matchmaking-toggle-grid"]');
    expect(grid.exists()).toBe(true);
    expect(grid.classes()).toContain("lg:grid-cols-4");
    expect(grid.classes()).toContain("sm:grid-cols-2");
    expect(grid.element.children).toHaveLength(4);
    expect(
      Array.from(grid.element.children).map((tile) =>
        tile.querySelector("h4")?.textContent?.trim(),
      ),
    ).toEqual(["Competitive - Pick System", "competitive", "wingman", "duel"]);
    expect(grid.findAll('[data-testid="setting-switch"]')).toHaveLength(4);
    expect(
      grid.find('[data-testid="captain-pick-toggle"]').find("p").exists(),
    ).toBe(false);
    expect(
      wrapper
        .find('[data-field-name="public.matchmaking_captain_pick_seconds"]')
        .exists(),
    ).toBe(true);

    await grid.find('[data-testid="captain-pick-toggle"]').trigger("click");
    await flushPromises();
    expect(mocks.apolloMutate).toHaveBeenCalledWith({
      mutation: expect.objectContaining({
        insert_settings_one: expect.arrayContaining([
          expect.objectContaining({
            object: {
              name: "public.matchmaking_competitive_captain_pick",
              value: "true",
            },
          }),
        ]),
      }),
    });

    wrapper.unmount();
  });
});
