// Chat messages/participant lists embed a snapshot of the sender's
// avatar_url at send/join time (see chat.service.ts's message payload
// and addUserToLobby) -- correct for history, but stale forever if the
// player changes their avatar afterwards. This resolves the *current*
// avatar live instead, falling back to the snapshot while the lookup is
// in flight or if it has no steam_id to look up.
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import gql from "graphql-tag";
import { useQuery } from "@vue/apollo-composable";

const LIVE_PLAYER_AVATAR_QUERY = gql`
  query LivePlayerAvatar($steamId: bigint!) {
    players_by_pk(steam_id: $steamId) {
      steam_id
      avatar_url
      custom_avatar_url
    }
  }
`;

export function useLivePlayerAvatar(
  steamId: MaybeRefOrGetter<string | undefined | null>,
  fallback: MaybeRefOrGetter<string | undefined | null> = null,
) {
  const enabled = computed(() => Boolean(toValue(steamId)));
  const variables = computed(() => ({ steamId: toValue(steamId) }));

  const { result } = useQuery(
    LIVE_PLAYER_AVATAR_QUERY,
    variables,
    () => ({
      enabled: enabled.value,
      fetchPolicy: "cache-first",
    }),
  );

  return computed(() => {
    const player = (result.value as any)?.players_by_pk;
    if (player) {
      return player.custom_avatar_url || player.avatar_url || toValue(fallback);
    }
    return toValue(fallback);
  });
}
