import { ref } from "vue";
export const tryUseNuxtApp = () => ({ $i18n: { locale: { value: "en" } } });
export const useAuthStore = () => ({ me: { steam_id: "1", name: "Local player", role: "verified_user", elo: { competitive: 6500, wingman: 5200, duel: 7000 } } });
export const useApolloClient = () => ({ client: { mutate: async () => ({ data: {} }) } });
export const useSubscription = () => ({ result: ref({ tournament_free_agents: Array.from({ length: 8 }, (_, i) => ({ id: String(i), player_steam_id: String(i + 1), player: { steam_id: String(i + 1), name: `Local player ${i + 1}`, elo: { competitive: 6000 + i * 100 } }, status: i > 5 ? "waitlisted" : "registered", party_id: i === 2 || i === 3 ? "party" : null, checked_in_at: i < 5 ? new Date().toISOString() : null, created_at: new Date(Date.now() + i * 1000).toISOString() })) }) });
