import { onBeforeUnmount, onMounted, ref } from "vue";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateSubscription } from "~/graphql/graphqlGen";
import { $, order_by } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import type { FriendPracticeSession } from "~/utilities/friendPractice";

// One subscription for the whole friends list, not one per row. Hasura's
// can_view_utility_practice_session decides what comes back: Open sessions,
// and Friends sessions of the viewer's accepted friends (DEAFCS). The where
// below only narrows that to live sessions somebody else is hosting.
const sessions = ref<FriendPracticeSession[]>([]);

let consumers = 0;
let subscribedFor: string | null = null;
let subscription: { unsubscribe: () => void } | null = null;

function stop() {
  subscription?.unsubscribe();
  subscription = null;
  subscribedFor = null;
  sessions.value = [];
}

function start() {
  const me = useAuthStore().me?.steam_id;

  if (!me) {
    stop();
    return;
  }

  if (subscription && subscribedFor === String(me)) {
    return;
  }

  stop();
  subscribedFor = String(me);

  subscription = getGraphqlClient()
    .subscribe({
      query: generateSubscription({
        utility_practice_sessions: [
          {
            where: {
              status: { _eq: $("status", "e_utility_practice_statuses_enum!") },
              access: { _in: $("access", "[e_utility_practice_access_enum!]") },
              host_steam_id: { _neq: $("me", "bigint!") },
            },
            order_by: [{ created_at: order_by.desc }],
            limit: 100,
          } as any,
          {
            id: true,
            host_steam_id: true,
            map_name: true,
            status: true,
            access: true,
            is_open: true,
            invite_code: true,
          },
        ],
      } as any),
      variables: { status: "Ready", access: ["Open", "Friends"], me },
    })
    .subscribe({
      next: ({ data }: any) => {
        sessions.value = (data?.utility_practice_sessions ??
          []) as FriendPracticeSession[];
      },
      error: (error: any) => {
        console.error("[friend-practice] subscription error:", error);
        sessions.value = [];
      },
    });
}

export function useFriendPracticeSessions() {
  onMounted(() => {
    consumers += 1;
    start();
  });

  onBeforeUnmount(() => {
    consumers = Math.max(0, consumers - 1);
    if (consumers === 0) {
      stop();
    }
  });

  return { sessions };
}
