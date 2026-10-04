<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import TwitchIcon from "~/components/icons/TwitchIcon.vue";
import { twitchChannelUrl } from "~/utilities/twitchChannel";

// A player's Twitch channel as a small external link (profile hero). Renders
// nothing without a channel; a green dot while the channel is live (any game:
// the dot is about the channel, not about a DEAFCS match).
const props = defineProps<{
  channel: string | null | undefined;
  live?: boolean;
  linkClass?: string | string[];
}>();

const { t } = useI18n();

const label = computed(() =>
  props.channel
    ? props.live
      ? t("player.twitch.live_title", { channel: props.channel })
      : t("player.twitch.title", { channel: props.channel })
    : "",
);
</script>

<template>
  <a
    v-if="channel"
    :href="twitchChannelUrl(channel)"
    target="_blank"
    rel="noopener noreferrer"
    :class="[linkClass, 'relative']"
    :title="label"
    :aria-label="label"
    data-testid="player-twitch-link"
    :data-live="live ? 'true' : 'false'"
  >
    <TwitchIcon class="h-3.5 w-3.5 fill-current" />
    <span
      v-if="live"
      data-testid="player-twitch-live-dot"
      class="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-background bg-emerald-500"
      aria-hidden="true"
    ></span>
  </a>
</template>
