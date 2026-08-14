import { computed } from "vue";
import type { Component, MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { Gamepad2, Swords, Users } from "lucide-vue-next";

export type FriendStatusKey =
  | "offline"
  | "available"
  | "in_lobby"
  | "in_draft"
  | "in_match";

const DOT_CLASS: Record<FriendStatusKey, string> = {
  offline: "bg-muted-foreground/40",
  available: "bg-green-500",
  in_lobby: "bg-sky-500",
  in_draft: "bg-[hsl(var(--tac-amber))]",
  in_match: "bg-red-500",
};

const ICON: Partial<Record<FriendStatusKey, Component>> = {
  in_lobby: Users,
  in_draft: Swords,
  in_match: Gamepad2,
};

const LABEL_KEY: Record<FriendStatusKey, string> = {
  offline: "common.offline",
  available: "matchmaking.friends.available",
  in_lobby: "matchmaking.friends.in_lobby",
  in_draft: "matchmaking.friends.in_draft",
  in_match: "matchmaking.friends.in_match",
};

export function useFriendStatus(
  player: MaybeRefOrGetter<any>,
  online: MaybeRefOrGetter<boolean>,
) {
  // Friend's current live match, oriented to their lineup (their score first).
  const currentMatch = computed(() => {
    const entry = toValue(player)?.player?.player_lineup?.[0];
    const match = entry?.lineup?.match;
    if (!match) return null;

    const friendLineupId = String(entry.lineup?.id ?? "");
    const isLineup1 = friendLineupId === String(match.lineup_1_id ?? "");

    const maps = match.match_maps ?? [];
    const currentMap =
      maps.find((m: any) => m.is_current_map) ??
      maps.find((m: any) => !m.winning_lineup_id) ??
      maps[maps.length - 1] ??
      null;

    const mapsWonBy = (mine: boolean) =>
      maps.filter(
        (m: any) =>
          m.winning_lineup_id &&
          (String(m.winning_lineup_id) === friendLineupId) === mine,
      ).length;

    const bestOf = match.options?.best_of ?? 1;

    return {
      id: match.id as string,
      type: match.options?.type ?? null,
      startedAt: match.started_at ?? null,
      hasLiveStream: (match.streams?.length ?? 0) > 0,
      bestOf,
      isSeries: bestOf > 1,
      mapName: currentMap?.map?.label ?? currentMap?.map?.name ?? null,
      mapNumber: currentMap?.order ?? null,
      friendScore: currentMap
        ? (isLineup1 ? currentMap.lineup_1_score : currentMap.lineup_2_score) ??
          0
        : null,
      oppScore: currentMap
        ? (isLineup1 ? currentMap.lineup_2_score : currentMap.lineup_1_score) ??
          0
        : null,
      friendMapsWon: mapsWonBy(true),
      oppMapsWon: mapsWonBy(false),
    };
  });

  const statusKey = computed<FriendStatusKey>(() => {
    const p = toValue(player)?.player;
    // A live 5stack match is our own data — it wins over Steam rich presence.
    if (currentMatch.value) return "in_match";
    if (toValue(online)) {
      if (p?.is_in_draft) return "in_draft";
      if (p?.is_in_lobby) return "in_lobby";
    }
    if (toValue(online)) return "available";
    return "offline";
  });

  const dotClass = computed(() => DOT_CLASS[statusKey.value]);
  const statusIcon = computed(() => ICON[statusKey.value] ?? null);
  const statusLabelKey = computed(() => LABEL_KEY[statusKey.value]);

  const joinableDraft = computed(() => {
    if (statusKey.value !== "in_draft") return null;
    const entry = toValue(player)?.player?.draft_game_players?.[0];
    const draft = entry?.draft_game;
    if (!draft) return null;
    const count = draft.players?.length ?? 0;
    return {
      id: draft.id as string,
      full: draft.capacity != null && count >= draft.capacity,
      requireApproval: !!draft.require_approval,
    };
  });

  // Mirrors joinableDraft above, for a friend's matchmaking lobby.
  // Invite-only lobbies aren't self-joinable at all (no Join button --
  // matches the Hasura insert_permissions rule, which only allows a
  // self-insert when access is Open, or Friends between existing
  // friends), so those return null just like a stranger's lobby would.
  const MAX_LOBBY_SIZE = 5;
  const joinableLobby = computed(() => {
    if (statusKey.value !== "in_lobby") return null;
    const entry = toValue(player)?.player?.lobby_players?.[0];
    const lobby = entry?.lobby;
    if (!lobby || !["Open", "Friends"].includes(lobby.access)) return null;
    const count = lobby.players?.length ?? 0;
    return {
      id: lobby.id as string,
      full: count >= MAX_LOBBY_SIZE,
    };
  });

  return {
    statusKey,
    dotClass,
    statusIcon,
    statusLabelKey,
    joinableDraft,
    joinableLobby,
    currentMatch,
  };
}
