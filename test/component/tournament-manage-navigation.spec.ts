// The Manage console must switch sections client-side: same mounted page,
// only the section changes, with Back/Forward and direct ?section= URLs.
//
// The root cause of the "full refresh" was app.vue keying <NuxtPage> on the
// path plus every query key except tab/mode, so each ?section= switch
// produced a new page key and Nuxt tore the whole page down. This test runs
// that exact key function (taken from app.vue) with the real route meta from
// manage.vue against a real vue-router, and counts page mounts.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, onMounted } from "vue";
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  useRoute,
} from "vue-router";

const root = path.resolve(__dirname, "../..");
const read = (file: string) =>
  readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

function loadPageKey() {
  const app = read("app.vue");
  const keys = app.match(/const TAB_QUERY_KEYS = [^;]+;/)?.[0];
  const start = app.indexOf("function pageKeyWithoutTabQuery(");
  // The function ends at the first line that is exactly "}".
  const end = app.indexOf("\n}\n", start) + 2;
  expect(keys).toBeTruthy();
  expect(start).toBeGreaterThan(-1);
  const js = transformSync(
    `function __pageKeyFactory() {\n${keys}\n${app.slice(start, end)}\nreturn pageKeyWithoutTabQuery;\n}`,
    { loader: "ts" },
  ).code;
  return new Function(`${js}\nreturn __pageKeyFactory();`)() as (route: any) => string;
}

function managePersistKeys(): string[] {
  const page = read("pages/tournaments/[tournamentId]/manage.vue");
  const match = page.match(/persistQueryKeys:\s*(\[[^\]]*\])/);
  expect(match).toBeTruthy();
  return JSON.parse(match![1]);
}

describe("Manage navigation stays client-side", () => {
  const pageKey = loadPageKey();
  const persistQueryKeys = managePersistKeys();
  const managePath = "/tournaments/t1/manage";

  it("the page key ignores ?section=, but not the tournament", () => {
    const key = (section: string, p = managePath) =>
      pageKey({ path: p, query: { section }, hash: "", meta: { persistQueryKeys } });
    expect(key("stages")).toBe(key("prizes"));
    expect(key("registration")).toBe(key("teams"));
    expect(key("stages")).not.toBe(key("stages", "/tournaments/t2/manage"));
    // Without the page meta (the old manage.vue) every section was a new page.
    expect(pageKey({ path: managePath, query: { section: "stages" }, hash: "", meta: {} }))
      .not.toBe(pageKey({ path: managePath, query: { section: "prizes" }, hash: "", meta: {} }));
  });

  it("switching sections, Back and Forward never remount the console", async () => {
    let mounts = 0;
    const Console = defineComponent({
      setup() {
        const route = useRoute();
        onMounted(() => mounts++);
        return () => h("div", { "data-section": String(route.query.section ?? "") });
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/tournaments/:tournamentId/manage", component: Console, meta: { persistQueryKeys } },
      ],
    });
    // Same shape as app.vue's <NuxtPage :page-key="pageKeyWithoutTabQuery" />.
    const Shell = defineComponent({
      setup: () => () =>
        h(RouterView, null, {
          default: ({ Component, route }: any) =>
            Component ? h(Component, { key: pageKey(route) }) : null,
        }),
    });

    // Direct URL to a section works.
    await router.push(`${managePath}?section=stages`);
    const wrapper = mount(Shell, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.find("[data-section]").attributes("data-section")).toBe("stages");

    for (const section of ["prizes", "awards", "registration", "teams"]) {
      await router.push({ path: managePath, query: { section } });
      await flushPromises();
      expect(wrapper.find("[data-section]").attributes("data-section")).toBe(section);
    }

    router.back();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(router.currentRoute.value.query.section).toBe("registration");
    expect(wrapper.find("[data-section]").attributes("data-section")).toBe("registration");

    router.forward();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(router.currentRoute.value.query.section).toBe("teams");

    expect(mounts).toBe(1);
  });

  it("the console pushes a history entry per section and ignores no-op switches", () => {
    const detail = read("components/tournament/TournamentDetail.vue");
    const method = detail.slice(
      detail.indexOf("setManageSection(section: string) {"),
      detail.indexOf("openChatRoom() {"),
    );
    expect(method).toContain("this.$router.push(");
    expect(method).toContain("if (this.$route.query.section === next) return;");
    // TournamentManage swaps only its section content.
    const manage = read("components/tournament/TournamentManage.vue");
    expect(manage).toContain("@click=\"emit('update:section', item.key)\"");
  });
});
