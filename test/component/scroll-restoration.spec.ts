// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

// Back/forward scroll restore for the default layout (ported from upstream
// 5Stack's composables/useScrollRestoration.ts). The page scrolls a div inside
// MainContent, so these specs drive that div through a fake router: a push
// opens the next page at the top, Back lands where the page was left.

vi.mock("~/composables/useScrollFloor", () => ({
  useScrollFloor: () => ({ reserve: vi.fn() }),
}));

type Route = { path: string; query: Record<string, unknown>; name?: string };
type Guard = (to: Route, from: Route, failure?: unknown) => void;

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
function flushFrames(times = 3) {
  for (let i = 0; i < times; i++) {
    const run = [...frames.values()];
    frames.clear();
    run.forEach((cb) => cb(performance.now()));
  }
}

let before: Guard[] = [];
let after: Guard[] = [];
let current: Route;
let position = 0;
let scroller: HTMLElement;
let root: HTMLElement;
let wrapper: VueWrapper | null = null;

function route(path: string, query: Record<string, unknown> = {}): Route {
  return { path, query };
}

function makeScroller() {
  const el = document.createElement("div");
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  Object.defineProperty(el, "scrollHeight", { value: 10000 });
  Object.defineProperty(el, "clientHeight", { value: 800 });
  return el;
}

// What vue-router does for a push: guards, then the new history entry.
function push(to: Route) {
  const from = current;
  before.forEach((guard) => guard(to, from));
  position++;
  window.history.pushState({ position }, "");
  current = to;
  after.forEach((guard) => guard(to, from));
  flushFrames();
}

// Back/forward: the browser swaps history.state, fires popstate, then the
// router runs its guards.
function pop(to: Route, toPosition: number) {
  const from = current;
  position = toPosition;
  window.history.replaceState({ position }, "");
  window.dispatchEvent(new PopStateEvent("popstate"));
  before.forEach((guard) => guard(to, from));
  current = to;
  after.forEach((guard) => guard(to, from));
  flushFrames();
}

async function install(start: Route) {
  vi.resetModules();
  const mod = await import("~/composables/useScrollRestoration");
  current = start;
  position = 0;
  window.history.replaceState({ position }, "");
  vi.stubGlobal("useRouter", () => ({
    currentRoute: { value: current },
    beforeEach: (guard: Guard) => before.push(guard),
    afterEach: (guard: Guard) => after.push(guard),
  }));
  vi.stubGlobal("useNuxtApp", () => ({
    hooks: { hookOnce: (_name: string, cb: () => void) => cb() },
  }));
  wrapper = mount(
    defineComponent({
      setup() {
        mod.useScrollRestorationAnchor(ref(scroller), ref(root));
        return () => h("div");
      },
    }),
  );
  return mod;
}

beforeEach(() => {
  frames = new Map();
  before = [];
  after = [];
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++nextFrame, cb);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  scroller = makeScroller();
  root = document.createElement("div");
  scroller.appendChild(root);
  document.body.appendChild(scroller);
});

afterEach(() => {
  // Ends any restore still following the page.
  window.dispatchEvent(new Event("wheel"));
  wrapper?.unmount();
  wrapper = null;
  scroller.remove();
  vi.unstubAllGlobals();
});

describe("Back/forward scroll restore", () => {
  it("opens a newly pushed page at the top", async () => {
    await install(route("/players"));
    scroller.scrollTop = 1200;

    push(route("/players/76561198000000001"));

    expect(scroller.scrollTop).toBe(0);
  });

  it("Back lands where the list was left", async () => {
    await install(route("/players"));
    scroller.scrollTop = 1200;
    push(route("/players/76561198000000001"));
    scroller.scrollTop = 300;

    pop(route("/players"), 0);

    expect(scroller.scrollTop).toBe(1200);
  });

  it("Forward lands where the next page was left", async () => {
    await install(route("/players"));
    scroller.scrollTop = 1200;
    push(route("/players/76561198000000001"));
    scroller.scrollTop = 300;
    pop(route("/players"), 0);
    window.dispatchEvent(new Event("wheel"));

    pop(route("/players/76561198000000001"), 1);

    expect(scroller.scrollTop).toBe(300);
  });

  it("keeps the scroll for a query-only change (tabs, filters)", async () => {
    await install(route("/matches"));
    scroller.scrollTop = 640;

    push(route("/matches", { tab: "stats" }));

    expect(scroller.scrollTop).toBe(640);
  });

  it("stops following the restore once the user scrolls", async () => {
    await install(route("/players"));
    scroller.scrollTop = 1200;
    push(route("/players/76561198000000001"));
    pop(route("/players"), 0);
    expect(scroller.scrollTop).toBe(1200);

    window.dispatchEvent(new Event("touchstart"));
    scroller.scrollTop = 50;
    flushFrames();

    expect(scroller.scrollTop).toBe(50);
  });

  it("does not restore a page that was pushed again rather than reached by Back", async () => {
    await install(route("/players"));
    scroller.scrollTop = 1200;
    push(route("/players/76561198000000001"));

    push(route("/players"));

    expect(scroller.scrollTop).toBe(0);
  });
});

describe("useHistoryState", () => {
  it("hands back the saved state on Back, and nothing on a fresh visit", async () => {
    const mod = await install(route("/leaderboard"));
    let page = 1;
    // Registered from a page component, as the list pages do.
    const visit = () => {
      let saved: unknown;
      const page$ = mount(
        defineComponent({
          setup() {
            saved = mod.useHistoryState("list", () => ({ page }));
            return () => h("div");
          },
        }),
      );
      return { saved, page$ };
    };
    const first = visit();
    expect(first.saved).toBeNull();

    page = 4;
    push(route("/players/76561198000000001"));
    first.page$.unmount();
    pop(route("/leaderboard"), 0);

    expect(mod.isRestoringHistory()).toBe(true);
    const again = visit();
    expect(again.saved).toEqual({ page: 4 });
    again.page$.unmount();
  });
});

describe("default layout wiring", () => {
  it("MainContent hands its page scroller to the restore", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(
      path.resolve(__dirname, "../../layouts/components/MainContent.vue"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(source).toContain(
      "useScrollRestorationAnchor(pageScroller, scrollFloorRootEl);",
    );
    expect(source).toMatch(
      /<div\n\s+ref="pageScroller"\n\s+class="flex-1 overflow-auto/,
    );
  });
});
