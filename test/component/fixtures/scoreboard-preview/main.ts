import * as Vue from "vue";
import { createI18n } from "vue-i18n";
import en from "../../../../i18n/locales/en.json";
import * as table from "../../../../components/ui/table";
import * as tooltip from "../../../../components/ui/tooltip";
import "../../../../assets/css/tailwind.css";
import { scoreboardFixture } from "../matchScoreboard";

// Local fixture only: no authentication, GraphQL, production data or writes.
Object.assign(globalThis, {
  computed: Vue.computed, ref: Vue.ref, watch: Vue.watch,
  useRuntimeConfig: () => ({ public: { apiDomain: "fixture.invalid", webDomain: "fixture.invalid" } }),
  useAuthStore: () => ({ me: null, isRoleAbove: () => false }),
  usePlayerActiveSeasonElo: () => ({ eloForPlayer: () => null }),
  navigateTo: (to: string) => { location.href = to; },
});
const { default: Preview } = await import("./Preview.vue");
const app = Vue.createApp(Preview);
// Row expansion uses fixture data only, never a real GraphQL service.
app.config.globalProperties.$apollo = { query: async () => ({ data: { matches_by_pk: scoreboardFixture(new URLSearchParams(location.search).get("stats") !== "0", Number(new URLSearchParams(location.search).get("bo") || 1)) } }) };
app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
for (const [name, component] of Object.entries({ ...table, ...tooltip })) app.component(name, component as any);
app.component("NuxtLink", Vue.defineComponent({ props: ["to"], setup: (p, { slots }) => () => Vue.h("a", { href: p.to }, slots.default?.()) }));
app.component("NuxtImg", Vue.defineComponent({ props: ["src"], setup: p => () => Vue.h("img", { src: p.src }) }));
app.mount("#app");
