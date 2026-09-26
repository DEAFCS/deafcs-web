<script lang="ts" setup>
import SteamIcon from "~/components/icons/SteamIcon.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import SanctionStatusBadge from "~/components/SanctionStatusBadge.vue";
</script>

<template>
  <NuxtLink
    v-if="player"
    :to="`/players/${player.steam_id}`"
    class="group relative block overflow-hidden rounded-lg border border-border bg-card/40 p-4 transition-colors hover:border-[hsl(var(--tac-amber)/0.5)]"
  >
    <div class="flex items-start gap-3">
      <div class="relative shrink-0">
        <div
          class="h-14 w-14 overflow-hidden rounded-md border border-border bg-muted"
        >
          <img
            v-if="playerAvatarSrc"
            :src="playerAvatarSrc"
            :alt="player.name"
            class="h-full w-full object-cover"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground"
          >
            {{ (player.name || "?").charAt(0).toUpperCase() }}
          </div>
        </div>
        <SanctionStatusBadge
          v-if="activeSanctionType"
          :type="activeSanctionType"
          variant="overlay"
        />
      </div>

      <div class="min-w-0 flex-1 space-y-1">
        <div
          class="inline-flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.28em] text-[hsl(var(--tac-amber))]"
        >
          <span class="h-[2px] w-[14px] bg-[hsl(var(--tac-amber))]"></span>
          {{ $t("pages.players.detail.player_profile") }}
        </div>
        <h3
          class="truncate text-lg font-bold group-hover:text-[hsl(var(--tac-amber))]"
        >
          {{ player.name }}
        </h3>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TimezoneFlag
            v-if="player.country"
            :country="player.country"
            class="h-auto w-[1.1rem] shrink-0"
          />
          <span class="font-mono">{{ player.steam_id }}</span>
          <SteamIcon
            v-if="player.profile_url"
            class="h-3 w-3 shrink-0 fill-current"
          />
        </div>
        <span
          v-if="player.role && player.role !== 'user'"
          class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ player.role.replace("_", " ") }}
        </span>
      </div>
    </div>

    <div class="mt-3 border-t border-border/60 pt-3">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0 space-y-1.5">
          <span
            class="inline-flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            {{ $t("pages.players.detail.recent_form") }}
            <span class="tabular-nums text-foreground/70">
              {{ recentForm.wins }}&ndash;{{ recentForm.losses }}
            </span>
          </span>
          <div class="flex gap-0.5">
            <span
              v-for="dot in recentForm.dots"
              :key="dot.key"
              class="h-2.5 w-2.5 rounded-sm"
              :class="[
                dot.result === 'win'
                  ? 'bg-emerald-500'
                  : dot.result === 'loss'
                    ? 'bg-red-500'
                    : dot.result === 'tie'
                      ? 'bg-muted-foreground/40'
                      : 'border border-foreground/15 bg-transparent',
              ]"
            ></span>
          </div>
        </div>
        <span
          class="shrink-0 font-mono text-sm font-semibold tabular-nums"
          :class="
            recentForm.net > 0
              ? 'text-emerald-400'
              : recentForm.net < 0
                ? 'text-red-400'
                : 'text-muted-foreground'
          "
        >
          <template v-if="recentForm.net > 0">&#9650; +{{ recentForm.net }}</template>
          <template v-else-if="recentForm.net < 0">&#9660; {{ recentForm.net }}</template>
          <template v-else>+0</template>
        </span>
      </div>
    </div>
  </NuxtLink>
</template>

<script lang="ts">
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, order_by } from "~/generated/zeus";
import { playerFields } from "~/graphql/playerFields";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";

const RECENT_FORM_COUNT = 12;

export default {
  props: {
    steamId: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      player: null as any,
      eloHistory: [] as any[],
    };
  },
  apollo: {
    player: {
      query: typedGql("query")({
        players_by_pk: [{ steam_id: $("steamId", "bigint!") }, playerFields],
      }),
      variables(): { steamId: string } {
        return { steamId: (this as any).steamId };
      },
      update: (data: any) => data?.players_by_pk ?? null,
    },
    eloHistory: {
      query: typedGql("query")({
        v_player_elo: [
          {
            where: { player_steam_id: { _eq: $("steamId", "bigint!") } },
            order_by: [{ match_created_at: order_by.desc }],
            limit: RECENT_FORM_COUNT,
          },
          {
            match_id: true,
            match_created_at: true,
            match_result: true,
            elo_change: true,
          },
        ],
      }),
      variables(): { steamId: string } {
        return { steamId: (this as any).steamId };
      },
      update: (data: any) => (data?.v_player_elo ?? []).slice().reverse(),
    },
  },
  computed: {
    apiDomain() {
      return useRuntimeConfig().public.apiDomain;
    },
    playerAvatarSrc() {
      if (!this.player) return null;
      return resolveAvatarUrl(
        (this.player as any).custom_avatar_url || (this.player as any).avatar_url,
        this.apiDomain,
      );
    },
    activeSanctionType(): "ban" | "mute" | "gag" | null {
      if ((this.player as any)?.is_admin_sanctioned) return "ban";
      if ((this.player as any)?.is_muted) return "mute";
      if ((this.player as any)?.is_gagged) return "gag";
      return null;
    },
    recentForm() {
      const slice = (this.eloHistory ?? []).slice(-RECENT_FORM_COUNT);
      let wins = 0;
      let losses = 0;
      let net = 0;
      const played = slice.map((e: any, i: number) => {
        const r = (e.match_result ?? "").toLowerCase();
        const result =
          r === "won" || r === "win"
            ? "win"
            : r === "lost" || r === "loss"
              ? "loss"
              : "tie";
        if (result === "win") wins++;
        else if (result === "loss") losses++;
        net += typeof e.elo_change === "number" ? e.elo_change : 0;
        return { key: e.match_id ?? `${e.match_created_at}-${i}`, result };
      });
      const blanks = Array.from(
        { length: Math.max(0, RECENT_FORM_COUNT - played.length) },
        (_, i) => ({ key: `blank-${i}`, result: "blank" }),
      );
      return { dots: [...blanks, ...played], wins, losses, net };
    },
  },
};
</script>
