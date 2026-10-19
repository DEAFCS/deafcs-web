// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { computed, ref } from "vue";
import { shallowMount } from "@vue/test-utils";

// Regression, 2026-10-19 (TricoN's iPhone PWA, Leaderboard -> player profile,
// no Back arrow): signed-in moderators and above do not get TopNav at all;
// layouts/default.vue gives them AppHeader + the sidebar instead, and the
// arrow only lived in TopNav. Both top bars must carry it on phone widths.

const isMobile = ref(true);

vi.mock("~/components/ui/sidebar/utils", () => ({
  useSidebar: () => ({ isMobile }),
}));
vi.mock("@/composables/useHubState", () => ({
  useHubState: () => ({ openLastOrDefaultHub: vi.fn() }),
}));
vi.mock("~/composables/useChatTabs", () => ({
  useChatTabs: () => ({ unreadCounts: ref({}) }),
}));

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(
    /\r\n/g,
    "\n",
  );

describe("staff top bar (AppHeader)", () => {
  beforeEach(() => {
    // Nuxt auto-imports these; plain Vitest does not.
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useAuthStore", () => ({
      me: { steam_id: "1", role: "administrator" },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function render() {
    const { default: AppHeader } = await import(
      "~/layouts/components/AppHeader.vue"
    );
    return shallowMount(AppHeader, {
      global: { stubs: { Button: true }, mocks: { $t: (k: string) => k } },
    });
  }

  it("shows the Back arrow on phone widths, before the sidebar button", async () => {
    isMobile.value = true;
    const html = (await render()).html();

    const back = html.indexOf("mobile-back-button-stub");
    const sidebar = html.indexOf("sidebar-trigger-stub");
    expect(back).toBeGreaterThan(-1);
    expect(sidebar).toBeGreaterThan(back);
  });

  it("leaves the desktop staff bar unchanged", async () => {
    isMobile.value = false;
    const html = (await render()).html();

    expect(html).not.toContain("mobile-back-button-stub");
    expect(html).toContain("sidebar-trigger-stub");
  });
});

describe("every default-layout top bar carries the arrow", () => {
  it("the layout picks TopNav or AppHeader, and both have it", () => {
    const layout = read("layouts/default.vue");
    expect(layout).toContain('<TopNav v-if="!showLeftNav" />');
    expect(layout).toContain('<AppHeader class="px-6" v-if="showLeftNav" />');

    for (const bar of [
      "layouts/components/TopNav.vue",
      "layouts/components/AppHeader.vue",
    ]) {
      expect(read(bar), bar).toContain('<MobileBackButton v-if="isMobile" />');
    }
  });
});
