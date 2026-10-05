import { createApp, h, ref } from "vue";
import { createI18n } from "vue-i18n";
import en from "../../../i18n/locales/en.json";
import "../../../assets/css/tailwind.css";
(globalThis as any).useRuntimeConfig = () => ({ public: { apiDomain: "127.0.0.1:18082", webDomain: "127.0.0.1:18083" } });
(globalThis as any).navigateTo = () => {};
(globalThis as any).useWebsiteRestrictionStore = () => ({ isRestricted: false });
const previewState = new Map();
(globalThis as any).useState = (key: string, init: () => unknown) => {
  if (!previewState.has(key)) previewState.set(key, ref(init()));
  return previewState.get(key);
};
(globalThis as any).useMatchmakingStore = () => ({ currentLobby: null });
const { default: Preview } = await import("./Preview.vue");
const app = createApp(Preview);
app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
app.component("NuxtLink", { props: ["to"], setup: (p: any, ctx: any) => () => h("a", { ...ctx.attrs, href: typeof p.to === "string" ? p.to : "#" }, ctx.slots.default?.()) });
app.mount("#app");
