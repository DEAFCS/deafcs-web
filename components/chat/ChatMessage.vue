<script setup lang="ts">
import TimeAgo from "~/components/TimeAgo.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
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
        :linkable="false"
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
        <component
          :is="roleBadge.icon"
          v-if="roleBadge"
          :class="['h-3 w-3 shrink-0', roleBadge.class]"
        />
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
import { useLivePlayerAvatar } from "~/composables/useLivePlayerAvatar";

// Elevated roles only -- regular (verified_)user and streamer get no
// badge at all next to their name, just the avatar.
const ROLE_BADGE: Record<string, { icon: any; class: string }> = {
  moderator: { icon: ShieldHalf, class: "text-blue-500" },
  match_organizer: { icon: Shield, class: "text-yellow-500" },
  tournament_organizer: { icon: Shield, class: "text-orange-500" },
  administrator: { icon: Crown, class: "text-red-500" },
};

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
  setup(props: any) {
    const liveAvatarUrl = useLivePlayerAvatar(
      () => props.message?.from?.steam_id,
      () => props.message?.from?.avatar_url,
    );
    return { liveAvatarUrl };
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
};
</script>
