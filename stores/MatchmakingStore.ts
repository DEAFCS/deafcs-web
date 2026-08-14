import { ref, watch, computed } from "vue";
import { defineStore, acceptHMRUpdate } from "pinia";
import { useSubscriptionManager } from "~/composables/useSubscriptionManager";
import {
  e_match_types_enum,
  $,
  e_lobby_access_enum,
  e_draft_game_status_enum,
  e_match_status_enum,
  order_by,
} from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery, generateSubscription } from "~/graphql/graphqlGen";
import { playerFields } from "~/graphql/playerFields";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { webrtc } from "~/web-sockets/Webrtc";
import { setActiveHub } from "~/composables/useHubState";
import { useChatTabs } from "~/composables/useChatTabs";

const REGION_LATENCY_PREFIX = "5stack_region_latency_";
const MAX_LATENCY_KEY = "5stack_max_acceptable_latency";
const PREFERRED_REGIONS_KEY = "5stack_preferred_regions";

function safeParseLocalStorage<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export const useMatchmakingStore = defineStore("matchmaking", () => {
  const playersOnline = ref([]);
  const onlinePlayerSteamIds = ref<string[]>([]);

  const joinedMatchmakingQueues = ref<{
    details?: {
      totalInQueue: number;
      type: e_match_types_enum;
      regions: Array<string>;
    };
    confirmation?: {
      matchId: string;
      isReady: boolean;
      expiresAt: string;
      confirmed: number;
      confirmationId: string;
      type: e_match_types_enum;
      region: string;
      players: number;
    };
  }>({
    details: undefined,
    confirmation: undefined,
  });

  const regionStats = ref<
    Partial<Record<string, Partial<Record<e_match_types_enum, number[]>>>>
  >({});

  const queryPlayers = async () => {
    const steamIds = onlinePlayerSteamIds.value;
    if (steamIds.length === 0) {
      return;
    }
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        players: [
          {
            where: {
              steam_id: {
                _in: $("steam_ids", "[bigint]!"),
              },
            },
          },
          playerFields,
        ],
      }),
      variables: {
        steam_ids: steamIds,
      },
    });

    playersOnline.value = data.players;
  };

  const friends = ref([]);
  const lobbies = ref([]);

  const viewingMatchId = ref<string | undefined>();
  const subscribeToFriends = async (mySteamId: bigint) => {
    const subscription = getGraphqlClient().subscribe({
      query: generateSubscription({
        my_friends: [
          {},
          {
            elo: true,
            name: true,
            role: true,
            country: true,
            steam_id: true,
            avatar_url: true,
            custom_avatar_url: true,
            status: true,
            invited_by_steam_id: true,
            last_presence_state: true,
            presence_updated_at: true,
            player: {
              steam_id: true,
              is_in_lobby: true,
              is_in_another_match: true,
              is_in_draft: true,
              // Drives the "IN A LOBBY" Join mini-button (FriendListItem.vue /
              // useFriendStatus's joinableLobby) -- need the lobby's access
              // level and current accepted headcount to know whether this
              // friend's lobby can actually be self-joined.
              lobby_players: [
                { limit: 1, where: { status: { _eq: "Accepted" } } },
                {
                  lobby_id: true,
                  lobby: {
                    id: true,
                    access: true,
                    players: [
                      { where: { status: { _eq: "Accepted" } } },
                      { steam_id: true },
                    ],
                  },
                },
              ],
              // Friend's current live match — drives the inline score preview.
              player_lineup: [
                {
                  limit: 1,
                  where: {
                    lineup: {
                      match: { status: { _eq: e_match_status_enum.Live } },
                    },
                  },
                },
                {
                  lineup: {
                    id: true,
                    match: {
                      id: true,
                      status: true,
                      started_at: true,
                      lineup_1_id: true,
                      lineup_2_id: true,
                      options: { type: true, best_of: true },
                      lineup_1: { id: true, name: true },
                      lineup_2: { id: true, name: true },
                      streams: [
                        { where: { is_live: { _eq: true } }, limit: 1 },
                        { id: true },
                      ],
                      match_maps: [
                        { order_by: [{ order: order_by.asc }] },
                        {
                          id: true,
                          order: true,
                          status: true,
                          is_current_map: true,
                          map: { name: true, label: true },
                          lineup_1_score: true,
                          lineup_2_score: true,
                          winning_lineup_id: true,
                        },
                      ],
                    },
                  },
                },
              ],
              draft_game_players: [
                {
                  limit: 1,
                  where: {
                    draft_game: {
                      match_id: { _is_null: true },
                      status: { _eq: e_draft_game_status_enum.Open },
                      access: {
                        _in: [
                          e_lobby_access_enum.Friends,
                          e_lobby_access_enum.Open,
                        ],
                      },
                    },
                  },
                },
                {
                  draft_game_id: true,
                  draft_game: {
                    id: true,
                    access: true,
                    status: true,
                    capacity: true,
                    type: true,
                    mode: true,
                    require_approval: true,
                    players: [
                      { where: { status: { _neq: "Waitlist" } } },
                      { steam_id: true, status: true },
                    ],
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const { subscribe } = useSubscriptionManager();
    subscribe(
      "matchmaking:friends",
      subscription.subscribe({
        next: ({ data }) => {
          friends.value = data.my_friends;
        },
      }),
    );
  };

  // Online = truly present: connected to 5stack web. Being merely assigned to
  // a live match lineup does NOT count — a roster slot isn't presence, the
  // player may not actually be around.
  const isActiveFriend = (friend: any) =>
    onlinePlayerSteamIds.value.includes(friend.steam_id);

  const onlineFriends = computed(() => {
    return friends.value?.filter(
      (friend: any) => friend.status !== "Pending" && isActiveFriend(friend),
    );
  });

  const offlineFriends = computed(() => {
    return friends.value?.filter(
      (friend: any) => friend.status !== "Pending" && !isActiveFriend(friend),
    );
  });

  const subscribeToLobbies = async (steam_id: bigint) => {
    const subscription = getGraphqlClient().subscribe({
      query: generateSubscription({
        lobbies: [
          {
            where: {
              players: {
                steam_id: {
                  _eq: $("steam_id", "bigint!"),
                },
              },
            },
          },
          {
            id: true,
            access: true,
            players: [
              {},
              {
                status: true,
                captain: true,
                player: playerFields,
              },
            ],
          },
        ],
      }),
      variables: {
        steam_id,
      },
    });

    const { subscribe } = useSubscriptionManager();
    subscribe(
      "matchmaking:lobbies",
      subscription.subscribe({
        next: ({ data }) => {
          lobbies.value = data.lobbies;
        },
      }),
    );
  };

  // Every lobby with access=Open that I'm not already in -- the "OPEN
  // LOBBY" browse list on the Play page, for joining someone you're not
  // (yet) friends with. Friends' lobbies already have their own Join
  // entry point on the friends list (joinableLobby in useFriendStatus),
  // so this deliberately doesn't special-case them out -- showing up in
  // both places isn't harmful.
  const openLobbies = ref<any[]>([]);
  const subscribeToOpenLobbies = async (steam_id: bigint) => {
    const subscription = getGraphqlClient().subscribe({
      query: generateSubscription({
        lobbies: [
          {
            where: {
              access: { _eq: e_lobby_access_enum.Open },
              _not: {
                players: { steam_id: { _eq: $("steam_id", "bigint!") } },
              },
            },
          },
          {
            id: true,
            players: [
              { where: { status: { _eq: "Accepted" } } },
              { captain: true, player: playerFields },
            ],
          },
        ],
      }),
      variables: { steam_id },
    });

    const { subscribe } = useSubscriptionManager();
    subscribe(
      "matchmaking:open-lobbies",
      subscription.subscribe({
        next: ({ data }) => {
          openLobbies.value = data.lobbies;
        },
      }),
    );
  };

  watch(
    () => useAuthStore().me?.steam_id,
    (steamId) => {
      if (steamId) {
        subscribeToFriends(steamId);
        subscribeToLobbies(steamId);
        subscribeToOpenLobbies(steamId);
      } else {
        const { unsubscribe } = useSubscriptionManager();
        unsubscribe("matchmaking:friends");
        unsubscribe("matchmaking:lobbies");
        unsubscribe("matchmaking:open-lobbies");
      }
    },
    { immediate: true },
  );

  watch(onlinePlayerSteamIds, (newSteamIds, oldSteamIds) => {
    if (
      newSteamIds.length !== oldSteamIds.length ||
      !newSteamIds.every((id, index) => id === oldSteamIds[index])
    ) {
      queryPlayers();
    }
  });

  const creatingLobby = ref(false);

  const createLobby = async () => {
    if (creatingLobby.value) {
      return;
    }
    creatingLobby.value = true;

    try {
      const { data } = await getGraphqlClient().mutate({
        mutation: typedGql("mutation")({
          insert_lobbies_one: [
            {
              object: {},
            },
            {
              id: true,
            },
          ],
        }),
      });
      const newLobbyId = data.insert_lobbies_one.id;

      if ((currentLobby.value as any)?.id !== newLobbyId) {
        await new Promise<void>((resolve) => {
          let stop: (() => void) | undefined;
          const timeout = setTimeout(() => {
            stop?.();
            resolve();
          }, 5000);
          stop = watch(currentLobby, (lobby: any) => {
            if (lobby?.id === newLobbyId) {
              clearTimeout(timeout);
              stop?.();
              resolve();
            }
          });
        });
      }

      setActiveHub("lobby");
      return newLobbyId;
    } finally {
      creatingLobby.value = false;
    }
  };

  const inviteToLobby = async (steam_id: string) => {
    const me = useAuthStore().me;

    let lobby_id = me?.current_lobby_id;

    if (!lobby_id) {
      lobby_id = await createLobby();
    }

    await getGraphqlClient().mutate({
      mutation: typedGql("mutation")({
        insert_lobby_players_one: [
          {
            object: {
              steam_id,
              lobby_id,
            },
          },
          {
            __typename: true,
          },
        ],
      }),
    });
  };

  // Self-join an Open/Friends lobby someone else owns -- distinct from
  // inviteToLobby above (a captain adding someone else to THEIR lobby).
  // Two-step because insert_permissions won't let a self-insert set
  // status directly (always lands as 'Invited'); both mutations run in
  // the same GraphQL request so Hasura commits them as one transaction
  // -- if the capacity trigger (see 1877000008000_lobby_players_capacity_trigger
  // migration) rejects the Accepted update because the lobby's already
  // full, the Invited insert is rolled back too, not left dangling.
  const joinLobby = async (lobby_id: string) => {
    const steam_id = useAuthStore().me?.steam_id;
    await getGraphqlClient().mutate({
      mutation: typedGql("mutation")({
        insert_lobby_players_one: [
          { object: { steam_id, lobby_id } },
          { __typename: true },
        ],
        update_lobby_players_by_pk: [
          {
            pk_columns: { steam_id, lobby_id },
            _set: { status: "Accepted" },
          },
          { __typename: true },
        ],
      }),
    });
    // Land on the chat sidebar's matchmaking lobby tab, not the
    // standalone Lobby hub panel. Open (or focus, if it's already open
    // for some reason) the tab explicitly here rather than trusting
    // useChatTabSetup's reactive watch on me.current_lobby_id to do it
    // -- that watch's ensureDefaultTabs() deliberately restores
    // whatever tab was active before it ran ("adding defaults doesn't
    // steal focus"), so relying on it left the *previous* tab (e.g. a
    // pinned tournament chat) active instead of the lobby just joined.
    const { openTab } = useChatTabs();
    openTab({
      id: `matchmaking:${lobby_id}`,
      // Hardcoded (not useI18n()'s t()) deliberately -- calling that
      // composable from inside a Pinia store action crashed SSR outright
      // (every page returned 500, not just this flow) since it can run
      // outside any component's setup context. Matches the English
      // value of chat_tab_labels.lobby_default; ensureDefaultTabs' own
      // reactive watch (useChatTabSetup.ts) still uses the real
      // translated t() call whenever it creates this tab instead of us.
      label: "Lobby",
      instance: "matchmaking",
      type: "matchmaking",
      lobbyId: lobby_id,
      pinned: true,
    });
    setActiveHub("chat");
  };

  const storedRegions = ref<string[]>(
    safeParseLocalStorage<string[]>(PREFERRED_REGIONS_KEY) ?? [],
  );

  const latencies = ref(new Map<string, number[]>());

  // Load existing latencies from localStorage for each region
  useApplicationSettingsStore().availableRegions.forEach((region) => {
    const key = REGION_LATENCY_PREFIX + region.value;
    const parsed = safeParseLocalStorage<number[]>(key);
    if (parsed) {
      latencies.value.set(region.value, parsed);
    }
  });

  const savedMaxLatency = localStorage.getItem(MAX_LATENCY_KEY);
  const playerMaxAcceptableLatency = ref(
    savedMaxLatency ? parseInt(savedMaxLatency) : 75,
  );

  const isRefreshing = ref(false);
  async function refreshLatencies() {
    if (isRefreshing.value) {
      return;
    }
    isRefreshing.value = true;
    resetLatencies();
    await Promise.all(
      useApplicationSettingsStore().availableRegions.map((region) =>
        getLatency(region.value),
      ),
    );
    isRefreshing.value = false;
  }

  function checkLatenies() {
    // Guests can't matchmake; don't open WebRTC peer connections for them.
    if (!useAuthStore().me?.steam_id) {
      return;
    }
    if (latencies.value.size === 0) {
      refreshLatencies();
    }
  }

  async function getLatency(region: string) {
    return new Promise(async (resolve) => {
      setTimeout(() => {
        resolve(undefined);
      }, 5000);
      try {
        const buffer = new Uint8Array([0x01]).buffer;

        const datachannel = await webrtc.connect(region, (data) => {
          if (data === "") {
            datachannel.send(buffer);
            return;
          }

          const event = JSON.parse(data) as {
            type: string;
            data: Record<string, unknown>;
          };

          if (event.type === "latency-results") {
            datachannel.close();
            latencies.value.set(region, event.data);
          }
        });

        datachannel.send("latency-test");
      } catch (error) {
        console.error(`Failed to get latency for ${region}`, error);
        resolve(undefined);
      }
    });
  }

  function togglePreferredRegion(region: string) {
    const index = storedRegions.value.indexOf(region);
    if (index !== -1) {
      storedRegions.value.splice(index, 1);
    } else {
      storedRegions.value.push(region);
    }
    localStorage.setItem(
      PREFERRED_REGIONS_KEY,
      JSON.stringify(storedRegions.value.filter(Boolean)),
    );
  }

  function updateMaxAcceptableLatency(latency: number) {
    playerMaxAcceptableLatency.value = latency;
    localStorage.setItem(MAX_LATENCY_KEY, latency.toString());
  }

  function resetLatencies() {
    latencies.value.clear();
    useApplicationSettingsStore().availableRegions.forEach((region) => {
      localStorage.removeItem(REGION_LATENCY_PREFIX + region.value);
    });
  }

  function getRegionlatencyResult(region: string):
    | {
        isLan: boolean;
        latency: string;
      }
    | undefined {
    const regionLatencies = latencies.value.get(region);
    if (!regionLatencies) {
      return;
    }
    return {
      isLan: regionLatencies.isLan,
      latency: Number(regionLatencies.latency).toFixed(2),
    };
  }

  const preferredRegions = computed(() => {
    const availableRegions =
      useApplicationSettingsStore().availableRegions.filter((region) => {
        const regionLatency = getRegionlatencyResult(region.value);

        if (regionLatency && region.is_lan && regionLatency.isLan) {
          return true;
        }

        if (
          regionLatency &&
          parseFloat(regionLatency?.latency) >
            parseFloat(
              useApplicationSettingsStore().maxAcceptableLatency || "75",
            )
        ) {
          return false;
        }

        return true;
      });

    if (isRefreshing.value) {
      return availableRegions;
    }

    if (storedRegions.value.length > 0) {
      const _preferredRegions = availableRegions.filter((region) => {
        return storedRegions.value.includes(region.value);
      });
      if (_preferredRegions.length > 0) {
        return _preferredRegions;
      }
    }

    return availableRegions
      .filter((region) => {
        const regionResult = getRegionlatencyResult(region.value);

        if (!regionResult) {
          return true;
        }

        return (
          !isNaN(Number(regionResult.latency)) &&
          Number(regionResult.latency) <= playerMaxAcceptableLatency.value
        );
      })
      .sort((a, b) => {
        if (a.is_lan && !b.is_lan) {
          return -1;
        }
        if (!a.is_lan && b.is_lan) {
          return 1;
        }

        // For non-LAN regions, sort by latency
        return (
          Number(getRegionlatencyResult(a.value)?.latency) -
          Number(getRegionlatencyResult(b.value)?.latency)
        );
      });
  });

  // Classify lobbies by MY membership status within the `lobbies` subscription
  // itself, NOT by comparing against `me.current_lobby_id`. That field arrives
  // on a separate subscription (AuthStore.subscribeToMe) and lags behind this
  // one, so cross-referencing it makes a lobby briefly flip between "invite"
  // and "joined" while creating/joining/leaving (invite toast flashes, etc).
  const myLobbyStatus = (lobby: any) => {
    const meSteamId = String(useAuthStore().me?.steam_id ?? "");
    return lobby?.players?.find(
      (p: any) => String(p.player?.steam_id) === meSteamId,
    )?.status;
  };

  const lobbyInvites = computed(() => {
    if (!lobbies.value) return [];
    return lobbies.value.filter(
      (lobby: any) => myLobbyStatus(lobby) === "Invited",
    );
  });

  const currentLobby = computed(() => {
    return lobbies.value.find(
      (lobby: any) => myLobbyStatus(lobby) === "Accepted",
    );
  });

  return {
    friends,
    onlineFriends,
    offlineFriends,
    lobbies,
    currentLobby,
    regionStats,
    playersOnline,
    onlinePlayerSteamIds,
    joinedMatchmakingQueues,

    checkLatenies,
    refreshLatencies,
    isRefreshing,
    getRegionlatencyResult,
    togglePreferredRegion,
    updateMaxAcceptableLatency,

    latencies,
    storedRegions,
    preferredRegions,
    playerMaxAcceptableLatency,
    lobbyInvites,

    createLobby,
    creatingLobby,
    inviteToLobby,
    joinLobby,
    openLobbies,
    viewingMatchId,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMatchmakingStore, import.meta.hot));
}
