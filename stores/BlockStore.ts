import { ref, watch } from "vue";
import { defineStore, acceptHMRUpdate } from "pinia";
import { gql } from "@apollo/client/core";
import { useSubscriptionManager } from "~/composables/useSubscriptionManager";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { toast } from "~/components/ui/toast";

export type BlockedPlayer = {
  steam_id: string;
  name: string;
  avatar_url?: string | null;
  custom_avatar_url?: string | null;
  profile_url?: string | null;
  created_at: string;
};

// Raw gql, not the generated Zeus typed builder -- my_blocks comes from a
// Hasura view. The live metadata (select/insert/delete permissions for role
// "user") is confirmed applied and matches
// hasura/metadata/databases/default/tables/public_v_my_blocks.yaml exactly
// (verified 2026-09-19 against production's hdb_catalog.hdb_metadata); the
// committed Zeus codegen output just hasn't been regenerated against it yet.
// Same approach linked-accounts.vue already uses for its own subscriptions.
const MY_BLOCKS_SUBSCRIPTION = gql`
  subscription MyBlocks {
    my_blocks {
      steam_id
      name
      avatar_url
      custom_avatar_url
      profile_url
      created_at
    }
  }
`;

// Single reactive source of truth for "who have I blocked" -- mirrors
// MatchmakingStore's friends subscription. Fed by the live my_blocks
// subscription (public.v_my_blocks, filtered server-side to the caller's
// own outgoing blocks only), so a block/unblock made in one tab/component
// is reflected everywhere immediately with no local optimistic boolean to
// fall out of sync.
export const useBlockStore = defineStore("blocks", () => {
  const blocked = ref<BlockedPlayer[]>([]);

  const subscribeToBlocks = async () => {
    const subscription = getGraphqlClient().subscribe({
      query: MY_BLOCKS_SUBSCRIPTION,
    });

    const { subscribe } = useSubscriptionManager();
    subscribe(
      "blocks:my-blocks",
      subscription.subscribe({
        next: ({ data }: any) => {
          blocked.value = data?.my_blocks ?? [];
        },
        // Without this, any failure on my_blocks (network drop, a future
        // schema change, etc.) fails completely silently: `blocked` just
        // never updates and every Block/Unblock click looks like it does
        // nothing, with no signal anywhere for the user OR anyone debugging
        // it. Hardcoded string (not useI18n()'s t()) deliberately -- this
        // callback can fire from a Pinia store action outside any
        // component's setup context, and calling that composable there has
        // already crashed SSR outright elsewhere in this codebase (see
        // MatchmakingStore.ts's joinLobby()/createLobby() for the same fix).
        error: (error: unknown) => {
          console.error("my_blocks subscription failed", error);
          toast({
            variant: "destructive",
            title: "Error",
            description:
              "Could not load your blocked players. Try refreshing the page.",
          });
        },
      }),
    );
  };

  watch(
    () => useAuthStore().me?.steam_id,
    (steamId) => {
      if (steamId) {
        subscribeToBlocks();
      } else {
        const { unsubscribe } = useSubscriptionManager();
        unsubscribe("blocks:my-blocks");
        blocked.value = [];
      }
    },
    { immediate: true },
  );

  function isBlocked(steamId: string | number | bigint): boolean {
    const target = String(steamId);
    return blocked.value.some((b) => String(b.steam_id) === target);
  }

  return {
    blocked,
    isBlocked,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBlockStore, import.meta.hot));
}
