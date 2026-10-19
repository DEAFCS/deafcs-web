// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineComponent, h, reactive } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  CONTEXTUAL_BACK_ROUTES,
  hasInAppBack,
  showsGlobalBack,
} from "~/composables/useInAppBack";

// The phone / installed-app Back arrow. It only appears when vue-router's
// history entry points back at a DEAFCS page, never on the app's first entry
// (a cold PWA launch, a link from another site), and never on pages that
// already have their own Back link.

describe("in-app history", () => {
  it("has somewhere to go back to after an in-app navigation", () => {
    expect(hasInAppBack({ back: "/players", position: 3 })).toBe(true);
  });

  it("has nothing on the first entry (PWA launch, outside link, new tab)", () => {
    expect(hasInAppBack({ back: null, position: 0 })).toBe(false);
    expect(hasInAppBack(null)).toBe(false);
    expect(hasInAppBack({})).toBe(false);
  });

  it("never treats another site as somewhere to go back to", () => {
    expect(hasInAppBack({ back: "https://example.com/" })).toBe(false);
    expect(hasInAppBack({ back: "//example.com/" })).toBe(false);
  });

  it("stays hidden on pages with their own Back link", () => {
    for (const name of CONTEXTUAL_BACK_ROUTES) {
      expect(showsGlobalBack(name, { back: "/news" })).toBe(false);
    }
    expect(showsGlobalBack("players-id", { back: "/players" })).toBe(true);
  });
});

describe("MobileBackButton", () => {
  const route = reactive({ name: "players-id" as string });
  let afterEachHooks: Array<(to: { name: string }) => void> = [];
  const back = vi.fn();
  let wrapper: VueWrapper | null = null;

  async function render() {
    const { default: MobileBackButton } = await import(
      "~/layouts/components/MobileBackButton.vue"
    );
    wrapper = mount(MobileBackButton, {
      global: {
        mocks: { $t: (key: string) => (key === "layouts.top_nav.back" ? "Back" : key) },
        stubs: {
          Button: defineComponent({
            setup(_, { slots, attrs }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
        },
      },
    });
    return wrapper;
  }

  // Like Nuxt: the layout's useRoute() still shows the page being left when
  // afterEach runs; only the hook's `to` is the page being entered.
  function navigate(name: string, state: Record<string, unknown>) {
    window.history.replaceState(state, "");
    afterEachHooks.forEach((hook) => hook({ name }));
    route.name = name;
  }

  beforeEach(() => {
    afterEachHooks = [];
    back.mockReset();
    route.name = "players-id";
    vi.stubGlobal("useRoute", () => route);
    vi.stubGlobal("useRouter", () => ({
      back,
      afterEach: (hook: (to: { name: string }) => void) => {
        afterEachHooks.push(hook);
        return () => {};
      },
    }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.unstubAllGlobals();
  });

  it("is hidden when the app was opened straight onto this page", async () => {
    window.history.replaceState({ back: null, position: 0 }, "");
    const w = await render();
    expect(w.find('[data-testid="mobile-back"]').exists()).toBe(false);
  });

  it("appears after an in-app navigation and goes back with the router", async () => {
    window.history.replaceState({ back: null, position: 0 }, "");
    const w = await render();

    navigate("players-id", { back: "/players", position: 1 });
    await w.vm.$nextTick();
    const button = w.get('[data-testid="mobile-back"]');
    expect(button.attributes("aria-label")).toBe("Back");

    await button.trigger("click");
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not step back past the first entry if history changed under it", async () => {
    window.history.replaceState({ back: "/players", position: 1 }, "");
    const w = await render();
    window.history.replaceState({ back: null, position: 0 }, "");

    await w.get('[data-testid="mobile-back"]').trigger("click");

    expect(back).not.toHaveBeenCalled();
    expect(w.find('[data-testid="mobile-back"]').exists()).toBe(false);
  });

  it("hides on a page that has its own Back link", async () => {
    route.name = "awards";
    window.history.replaceState({ back: "/", position: 1 }, "");
    const w = await render();
    expect(w.find('[data-testid="mobile-back"]').exists()).toBe(true);

    // Awards -> an award, which has its own "Back to Awards".
    window.history.replaceState({ back: "/awards", position: 2 }, "");
    afterEachHooks.forEach((hook) => hook({ name: "awards-id" }));
    await w.vm.$nextTick();
    expect(w.find('[data-testid="mobile-back"]').exists()).toBe(false);
  });
});

describe("top bar placement", () => {
  const topNav = readFileSync(
    path.resolve(__dirname, "../../layouts/components/TopNav.vue"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("sits first in the top bar, on phone widths only", () => {
    const start = topNav.indexOf('<div class="flex min-w-0 items-center gap-1 sm:gap-3">');
    const backAt = topNav.indexOf('<MobileBackButton v-if="isMobile" />');
    const logoAt = topNav.indexOf("<NuxtLink", start);
    expect(start).toBeGreaterThan(-1);
    expect(backAt).toBeGreaterThan(start);
    expect(backAt).toBeLessThan(logoAt);
  });
});
