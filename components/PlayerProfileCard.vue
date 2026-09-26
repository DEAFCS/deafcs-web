<script lang="ts" setup>
import SteamIcon from "~/components/icons/SteamIcon.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import SanctionStatusBadge from "~/components/SanctionStatusBadge.vue";
</script>

<template>
  <NuxtLink
    v-if="player"
    :to="`/players/${player.steam_id}`"
    class="group relative block overflow-hidden rounded-lg border border-border bg-card/40 p-5 transition-colors hover:border-[hsl(var(--tac-amber)/0.5)]"
  >
    <div class="flex items-start gap-4">
      <div class="relative shrink-0">
        <div
          class="h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
        >
          <img
            v-if="playerAvatarSrc"
            :src="playerAvatarSrc"
            :alt="player.name"
            class="h-full w-full object-cover"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground"
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

      <div class="min-w-0 flex-1 space-y-1.5">
        <div
          class="inline-flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.28em] text-[hsl(var(--tac-amber))]"
        >
          <span class="h-[2px] w-[14px] bg-[hsl(var(--tac-amber))]"></span>
          {{ $t("pages.players.detail.player_profile") }}
        </div>
        <h3
          class="truncate text-2xl font-bold group-hover:text-[hsl(var(--tac-amber))]"
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
  </NuxtLink>
</template>

<script lang="ts">
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $ } from "~/generated/zeus";
import { playerFields } from "~/graphql/playerFields";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";

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
  },
};
</script>
