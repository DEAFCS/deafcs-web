import { reactive } from "vue";
import { gql } from "@apollo/client/core";
import getGraphqlClient from "~/graphql/getGraphqlClient";

// Module-level so every caller shares the same in-flight map -- mirrors
// useFriendActions.ts's inFlight convention.
const inFlight = reactive<Record<string, boolean>>({});

function sid(steam_id: string | number | bigint) {
  return String(steam_id);
}

// Raw gql (not the generated Zeus typed builder) -- my_blocks/my_blocks_one
// come from a Hasura view this codebase's committed codegen output hasn't
// seen yet (regenerating it requires introspecting a live Hasura instance
// with this change's metadata applied, which isn't available here). Same
// approach SanctionPlayer.vue already uses for its own custom mutations.
const BLOCK_PLAYER_MUTATION = gql`
  mutation BlockPlayer($steam_id: bigint!) {
    insert_my_blocks_one(object: { steam_id: $steam_id }) {
      steam_id
    }
  }
`;

const UNBLOCK_PLAYER_MUTATION = gql`
  mutation UnblockPlayer($steam_id: bigint!) {
    delete_my_blocks(where: { steam_id: { _eq: $steam_id } }) {
      affected_rows
    }
  }
`;

export function useBlockActions() {
  const blockStore = useBlockStore();

  function isBlocked(steam_id: string | number): boolean {
    return blockStore.isBlocked(sid(steam_id));
  }

  function isBusy(steam_id: string | number) {
    return inFlight[sid(steam_id)] === true;
  }

  async function run(steam_id: string | number, fn: () => Promise<unknown>) {
    const key = sid(steam_id);
    inFlight[key] = true;
    try {
      await fn();
    } finally {
      inFlight[key] = false;
    }
  }

  function blockPlayer(steam_id: string | number) {
    return run(steam_id, () =>
      getGraphqlClient().mutate({
        mutation: BLOCK_PLAYER_MUTATION,
        variables: { steam_id: sid(steam_id) },
      }),
    );
  }

  function unblockPlayer(steam_id: string | number) {
    return run(steam_id, () =>
      getGraphqlClient().mutate({
        mutation: UNBLOCK_PLAYER_MUTATION,
        variables: { steam_id: sid(steam_id) },
      }),
    );
  }

  return {
    isBlocked,
    isBusy,
    blockPlayer,
    unblockPlayer,
  };
}
