import { h, ref } from "vue";
// Public-page preview: Chat Hub store (lists the fixture tournament when the
// URL has ?chat) and NuxtLink for components importing it from #components.
export const useMatchLobbyStore = () => ({
  chatTournaments: new URLSearchParams(location.search).has("chat")
    ? [{ id: "00000000-0000-4000-8000-000000000001", name: "Fixture" }]
    : [],
});
// useRouteTab imports these from #app; main.ts installs the fixture route.
export const useRoute = () => (globalThis as any).useRoute();
export const useRouter = () => (globalThis as any).useRouter();
export const useState = (key: string, init: () => unknown) =>
  (globalThis as any).useState(key, init);
export const useNuxtApp = () => (globalThis as any).useNuxtApp();
export const NuxtLink = {
  props: ["to"],
  setup: (p: any, ctx: any) => () =>
    h("a", { ...ctx.attrs, href: typeof p.to === "string" ? p.to : p.to?.path ?? "#" }, ctx.slots.default?.()),
};
export const useApplicationSettingsStore = () => ({ availableRegions: [], teamMaxSubs: 2, settings: [], showSeparators: false });
export const tryUseNuxtApp = () => ({ $i18n: { locale: { value: "en" } } });
export const useAuthStore = () => ({ isAdmin: true, isRoleAbove: () => true, me: { steam_id: "1", name: "Local player", role: "verified_user", elo: { competitive: 6500, wingman: 5200, duel: 7000 } } });
export const useApolloClient = () => ({ client: {
  mutate: async () => ({ data: {} }),
  query: async () => ({ data: {} }),
  subscribe: () => ({ subscribe: (observer: any) => { observer.next?.({ data: {} }); return { unsubscribe() {} }; } }),
} });
export const useSubscription = () => ({ result: ref({ tournament_free_agents: Array.from({ length: 8 }, (_, i) => ({ id: String(i), player_steam_id: String(i + 1), player: { steam_id: String(i + 1), name: `Local player ${i + 1}`, elo: { competitive: 6000 + i * 100 } }, status: i > 5 ? "waitlisted" : "registered", party_id: i === 2 || i === 3 ? "party" : null, checked_in_at: i < 5 ? new Date().toISOString() : null, created_at: new Date(Date.now() + i * 1000).toISOString() })) }) });
