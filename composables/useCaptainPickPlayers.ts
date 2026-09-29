import { ref, watch, type Ref } from "vue";
import { $ } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { playerFields } from "~/graphql/playerFields";
import type { CaptainPickDraftState } from "~/utilities/captainPickDraft";

/**
 * The public player records (country, DEAFCS ELO, CS2 Premier, FACEIT,
 * avatar...) for a Captain Pick draft's ten players, from the same shared
 * playerFields fragment Draft Games uses, so flags, rating tabs and rating
 * hovers render exactly like a Draft. One query per draft, not per player.
 *
 * Display only: captains, turn order and auto-picks come from the server's
 * draft state and never from these records.
 */
export function useCaptainPickPlayers(
  draft: Ref<CaptainPickDraftState | null | undefined>,
) {
  const players = ref<Record<string, any>>({});
  let loadedFor: string | null = null;

  const load = async (current: CaptainPickDraftState) => {
    const steamIds = current.participants.map((p) => String(p.steam_id));
    const key = `${current.draftId}:${steamIds.join(",")}`;
    if (key === loadedFor || steamIds.length === 0) {
      return;
    }
    loadedFor = key;

    try {
      const { data } = await getGraphqlClient().query({
        query: generateQuery({
          players: [
            { where: { steam_id: { _in: $("steam_ids", "[bigint]!") } } },
            playerFields,
          ],
        }),
        variables: { steam_ids: steamIds },
      });

      const bySteamId: Record<string, any> = {};
      for (const player of data?.players ?? []) {
        bySteamId[String(player.steam_id)] = player;
      }
      players.value = bySteamId;
    } catch {
      // The draft still works with the names/ELO the server sent; allow a
      // later update to try again.
      loadedFor = null;
    }
  };

  watch(
    draft,
    (current) => {
      if (current) {
        void load(current);
      }
    },
    { immediate: true },
  );

  return { players };
}
