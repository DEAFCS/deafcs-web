import { createApp, h, ref } from "vue";
import * as Vue from "vue";
import { useVisualViewport } from "../../../composables/useVisualViewport";
import { createI18n, useI18n } from "vue-i18n";
import { createPinia } from "pinia";
import en from "../../../i18n/locales/en.json";
import "../../../assets/css/tailwind.css";
// Nuxt normally supplies Vue composables through its auto-import transform.
// The standalone Vite fixture supplies the same APIs to the real components.
Object.assign(globalThis, Vue);
(globalThis as any).useVisualViewport = useVisualViewport;
(globalThis as any).useI18n = useI18n;
(globalThis as any).useRuntimeConfig = () => ({ public: { apiDomain: "127.0.0.1:18082", webDomain: "127.0.0.1:18083" } });
(globalThis as any).navigateTo = () => {};
(globalThis as any).useWebsiteRestrictionStore = () => ({ isRestricted: false });
const previewState = new Map();
(globalThis as any).useState = (key: string, init: () => unknown) => {
  if (!previewState.has(key)) previewState.set(key, ref(init()));
  return previewState.get(key);
};
(globalThis as any).useMatchmakingStore = () => ({ currentLobby: null });
const search = new URLSearchParams(location.search);
(globalThis as any).useTournamentContext = () => useState("tournament-context", () => null);
const { default: Preview } = search.has("public")
  ? await import("./PublicPreview.vue")
  : search.has("manage") ? await import("./ManagePreview.vue") : await import("./Preview.vue");
const app = createApp(Preview);
// A reactive stand-in for vue-router so tab/query state behaves like the page.
const fixtureRoute = Vue.reactive({
  path: "/tournaments/00000000-0000-4000-8000-000000000001",
  params: { tournamentId: "00000000-0000-4000-8000-000000000001" },
  query: Object.fromEntries([...search.entries()].filter(([key]) => key === "tab")) as Record<string, any>,
  hash: "",
  fullPath: location.pathname,
});
const fixtureRouter = {
  push: async (to: any) => { if (to?.query) fixtureRoute.query = { ...to.query }; },
  replace: async (to: any) => { if (to?.query) fixtureRoute.query = { ...to.query }; },
};
app.config.errorHandler = (error: any, instance: any, info: string) => {
  console.error(`[fixture] ${info} in ${instance?.$options?.__name || instance?.$options?.name || "?"}:`, error?.stack || error);
};
app.config.globalProperties.$route = fixtureRoute as any;
app.config.globalProperties.$router = fixtureRouter as any;
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
app.config.globalProperties.$apollo = { mutate: async () => ({ data: {} }) } as any;
app.mixin({ created() {
  if ("e_tournament_stage_types" in this.$data) {
    this.$data.e_tournament_stage_types = ["SingleElimination", "DoubleElimination", "RoundRobin", "Swiss"].map(value => ({ value, description: value.replace(/([a-z])([A-Z])/g, "$1 $2") }));
  }
} });
(globalThis as any).useNuxtApp = () => ({ $apollo: app.config.globalProperties.$apollo });
(globalThis as any).useRoute = () => fixtureRoute;
(globalThis as any).useRouter = () => fixtureRouter;
(globalThis as any).useApplicationSettingsStore = () => ({ availableRegions: [], teamMaxSubs: 2, settings: [], showSeparators: false });
(globalThis as any).useAuthStore = () => ({ isAdmin: true, isRoleAbove: () => true, me: { steam_id: "1" } });
const formComponents = await import("../../../components/ui/form");
for (const [name, component] of Object.entries(formComponents)) app.component(name, component as any);
const alertComponents = await import("../../../components/ui/alert-dialog");
for (const [name, component] of Object.entries(alertComponents)) app.component(name, component as any);
app.component("Switch", (await import("../../../components/ui/switch")).Switch);
if (search.has("public")) {
  // Nuxt auto-registers components by name; the public page relies on that.
  // UI primitives eagerly, everything else lazily by file name.
  const ui = import.meta.glob("../../../components/ui/*/index.ts", { eager: true });
  for (const mod of Object.values(ui) as any[]) {
    for (const [name, component] of Object.entries(mod)) {
      if (/^[A-Z]/.test(name) && component && typeof component === "object" && !app.component(name)) app.component(name, component as any);
    }
  }
  const all = import.meta.glob("../../../components/**/*.vue");
  for (const [file, load] of Object.entries(all)) {
    const name = file.split("/").pop()!.replace(/\.vue$/, "");
    if (!app.component(name)) app.component(name, Vue.defineAsyncComponent(load as any));
  }
}
app.component("Input", (await import("../../../components/ui/input")).Input);
const dropdownComponents = await import("../../../components/ui/dropdown-menu");
for (const [name, component] of Object.entries(dropdownComponents)) app.component(name, component as any);
app.component("NuxtLink", { props: ["to"], setup: (p: any, ctx: any) => () => h("a", { ...ctx.attrs, href: typeof p.to === "string" ? p.to : "#" }, ctx.slots.default?.()) });
app.mount("#app");
