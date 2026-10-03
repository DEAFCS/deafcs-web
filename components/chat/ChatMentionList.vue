<script setup lang="ts">
defineProps<{
  results: Array<{ steam_id: string; name: string; avatar_url?: string }>;
  activeIndex: number;
  loading?: boolean;
}>();

defineEmits<{
  (e: "select", player: { steam_id: string; name: string }): void;
  (e: "hover", index: number): void;
}>();
</script>

<template>
  <div
    class="max-h-48 overflow-y-auto border-b bg-background p-1"
    role="listbox"
    :aria-label="$t('chat.mention_list', 'Mention a player')"
  >
    <div
      v-if="!results.length"
      class="px-2 py-1.5 text-xs text-muted-foreground"
    >
      {{
        loading
          ? $t("common.loading", "Loading…")
          : $t("chat.mention_no_results", "No players found")
      }}
    </div>
    <!-- mousedown (not click) so the textarea keeps focus and its caret -->
    <button
      v-for="(player, index) in results"
      :key="player.steam_id"
      type="button"
      role="option"
      :aria-selected="index === activeIndex"
      class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
      :class="index === activeIndex ? 'bg-accent text-accent-foreground' : ''"
      @mousedown.prevent="$emit('select', player)"
      @mousemove="$emit('hover', index)"
    >
      <img
        v-if="player.avatar_url"
        :src="player.avatar_url"
        alt=""
        class="h-5 w-5 shrink-0 rounded-full object-cover"
      />
      <span
        v-else
        class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase"
      >
        {{ (player.name || "?").charAt(0) }}
      </span>
      <span class="truncate">{{ player.name }}</span>
    </button>
  </div>
</template>
