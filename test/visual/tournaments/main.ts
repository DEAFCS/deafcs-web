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
const { default: Preview } = new URLSearchParams(location.search).has("manage") ? await import("./ManagePreview.vue") : await import("./Preview.vue");
const app = createApp(Preview);
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
app.config.globalProperties.$apollo = { mutate: async () => ({ data: {} }) } as any;
app.mixin({ created() {
  if ("e_tournament_stage_types" in this.$data) {
    this.$data.e_tournament_stage_types = ["SingleElimination", "DoubleElimination", "RoundRobin", "Swiss"].map(value => ({ value, description: value.replace(/([a-z])([A-Z])/g, "$1 $2") }));
  }
} });
(globalThis as any).useNuxtApp = () => ({ $apollo: app.config.globalProperties.$apollo });
(globalThis as any).useRoute = () => ({ params: { tournamentId: "00000000-0000-4000-8000-000000000001" }, query: {} });
(globalThis as any).useRouter = () => ({ push: () => {}, replace: () => {} });
(globalThis as any).useApplicationSettingsStore = () => ({ availableRegions: [], teamMaxSubs: 2, settings: [], showSeparators: false });
(globalThis as any).useAuthStore = () => ({ isAdmin: true, isRoleAbove: () => true, me: { steam_id: "1" } });
const formComponents = await import("../../../components/ui/form");
for (const [name, component] of Object.entries(formComponents)) app.component(name, component as any);
const alertComponents = await import("../../../components/ui/alert-dialog");
for (const [name, component] of Object.entries(alertComponents)) app.component(name, component as any);
app.component("Switch", (await import("../../../components/ui/switch")).Switch);
app.component("Input", (await import("../../../components/ui/input")).Input);
const dropdownComponents = await import("../../../components/ui/dropdown-menu");
for (const [name, component] of Object.entries(dropdownComponents)) app.component(name, component as any);
app.component("NuxtLink", { props: ["to"], setup: (p: any, ctx: any) => () => h("a", { ...ctx.attrs, href: typeof p.to === "string" ? p.to : "#" }, ctx.slots.default?.()) });
app.mount("#app");
