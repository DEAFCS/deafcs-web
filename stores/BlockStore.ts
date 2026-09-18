import { ref, watch } from "vue";
import { defineStore, acceptHMRUpdate } from "pinia";
import { gql } from "@apollo/client/core";
import { useSubscriptionManager } from "~/composables/useSubscriptionManager";
import getGraphqlClient from "~/graphql/getGraphqlClient";

export type BlockedPlayer = {
  steam_id: string;
  name: string;
  avatar_url?: string | null;
  custom_avatar_url?: string | null;
  profile_url?: string | null;
  created_at: string;
};

// Raw gql, not the generated Zeus typed builder -- my_blocks comes from a
// Hasura view this codebase's committed codegen output hasn't seen yet
// (regenerating it requires introspecting a live Hasura instance with this
// change's metadata applied). Same approach linked-accounts.vue already
// uses for its own subscriptions.
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
