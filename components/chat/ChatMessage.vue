<script setup lang="ts">
import TimeAgo from "~/components/TimeAgo.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";
</script>

<template>
  <div
    :class="[
      'relative pl-12 text-[11px] leading-snug',
      isSameSender && isCloseTogether ? 'mt-1' : 'mt-3',
    ]"
  >
    <div v-if="showMeta" class="absolute left-2 top-0">
      <PlayerDisplay
        :player="message.from"
        :avatar-override="liveAvatarUrl"
        size="sm"
        :compact="true"
        :align-top="true"
        :show-online="false"
        :show-elo="false"
        :show-steam-id="false"
        :tooltip="false"
        :linkable="true"
        :show-name="false"
        :show-flag="false"
        :show-role="false"
      />
    </div>

    <div>
      <div
        v-if="showMeta"
        class="flex items-center space-x-1.5 text-muted-foreground text-[10px]"
      >
        <FiveStackToolTip v-if="roleBadge" as-child>
          <template #trigger>
            <component
              :is="roleBadge.icon"
              :class="['h-3 w-3 shrink-0', roleBadge.class]"
            />
          </template>
          <span class="capitalize">
            {{ message.from.role?.replace("_", " ") }}
          </span>
        </FiveStackToolTip>
        <h4 class="font-semibold truncate max-w-[140px]">
          {{ message.from.name }}
        </h4>
        <span class="text-[10px] whitespace-nowrap">
          <time-ago :date="message.timestamp" hide-icon></time-ago>
        </span>
      </div>
      <p class="text-[11px] leading-snug break-words">
        {{ message.message }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import { Crown, Shield, ShieldHalf } from "lucide-vue-next";
import gql from "graphql-tag";

// Elevated roles only -- regular (verified_)user and streamer get no
// badge at all next to their name, just the avatar.
const ROLE_BADGE: Record<string, { icon: any; class: string }> = {
  moderator: { icon: ShieldHalf, class: "text-blue-500" },
  match_organizer: { icon: Shield, class: "text-yellow-500" },
  tournament_organizer: { icon: Shield, class: "text-orange-500" },
  administrator: { icon: Crown, class: "text-red-500" },
};

const LIVE_PLAYER_AVATAR_QUERY = gql`
  query LivePlayerAvatarForChat($steamId: bigint!) {
    players_by_pk(steam_id: $steamId) {
      steam_id
      avatar_url
      custom_avatar_url
    }
  }
`;

export default {
  props: {
    message: {
      type: Object,
      required: false,
    },
    previousMessage: {
      type: Object,
      required: false,
    },
  },
  data() {
    return {
      // Chat messages embed a snapshot of the sender's avatar_url from
      // send time (chat.service.ts) -- never updated if they change
      // their avatar afterwards. This overrides it with a live lookup
      // once resolved; null (the default) falls straight through to
      // PlayerDisplay's normal player.avatar_url, so there's no flash
      // of a missing avatar while this is in flight.
      liveAvatarUrl: null as string | null,
    };
  },
  created() {
    this.fetchLiveAvatar();
  },
  computed: {
    isSameSender() {
      if (!this.previousMessage) {
        return false;
      }
      return this.message.from.steam_id === this.previousMessage.from.steam_id;
    },
    isCloseTogether() {
      if (!this.isSameSender || !this.previousMessage) {
        return false;
      }
      const previousTimestamp = new Date(this.previousMessage.timestamp);
      const messageTimestamp = new Date(this.message.timestamp);

      messageTimestamp.setMinutes(messageTimestamp.getMinutes() - 5);

      return previousTimestamp > messageTimestamp;
    },
    showMeta() {
      return !this.isSameSender || !this.isCloseTogether;
    },
    roleBadge() {
      return ROLE_BADGE[this.message?.from?.role] ?? null;
    },
  },
  methods: {
    async fetchLiveAvatar() {
      const steamId = this.message?.from?.steam_id;
      if (!steamId) return;
      try {
        const { data } = await (this as any).$apollo.query({
          query: LIVE_PLAYER_AVATAR_QUERY,
          variables: { steamId },
          fetchPolicy: "cache-first",
        });
        const player = data?.players_by_pk;
        if (player) {
          this.liveAvatarUrl =
            player.custom_avatar_url || player.avatar_url || null;
        }
      } catch {
        // Best-effort -- keep the snapshot avatar on any failure
        // (network, permissions, player deleted, etc).
      }
    },
  },
};
</script>
