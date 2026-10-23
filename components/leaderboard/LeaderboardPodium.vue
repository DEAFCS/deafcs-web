<script setup lang="ts">
import { computed } from "vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import LeaderboardYouTag from "~/components/leaderboard/LeaderboardYouTag.vue";

// The top three as a podium, ported from 5Stack's LeaderboardBoard podium
// (5stackgg/web 4cdf53bc, #985). DEAFCS differences: a card links to the
// player's profile like the table rows do (DEAFCS has no player side panel),
// and the page hands in its own value formatting and tier colours so ELO,
// rolling windows and trophies read exactly as they do in the table.
type PodiumEntry = {
  rank: number;
  player_steam_id: string;
  player_name: string;
  player_avatar_url: string | null;
  player_custom_avatar_url: string | null;
  player_country: string | null;
  value: number;
  secondary_value: number | null;
  tertiary_value: number | null;
  matches_played: number | null;
};

const props = defineProps<{
  // The first three entries of page one, in rank order.
  entries: PodiumEntry[];
  isAwards: boolean;
  meSteamId: string | null;
  highlightedSteamId: string | null;
  formatValue: (entry: PodiumEntry) => string;
  valueColor: (entry: PodiumEntry) => string | undefined;
  meta: (entry: PodiumEntry) => string;
}>();

const AWARD_COLORS = {
  mvp: "hsl(195 85% 60%)",
  gold: "hsl(45 95% 60%)",
  silver: "hsl(0 0% 78%)",
  bronze: "hsl(28 70% 52%)",
};
const PLACE_COLORS = [
  AWARD_COLORS.gold,
  AWARD_COLORS.silver,
  AWARD_COLORS.bronze,
];
const MEDALS = [
  { field: "value", color: AWARD_COLORS.gold },
  { field: "secondary_value", color: AWARD_COLORS.silver },
  { field: "tertiary_value", color: AWARD_COLORS.bronze },
] as const;

// Second, first, third: the leader stands in the middle.
const podium = computed(() => {
  const [first, second, third] = props.entries;
  return [
    { place: 2, entry: second ?? null },
    { place: 1, entry: first ?? null },
    { place: 3, entry: third ?? null },
  ];
});

function playerOf(entry: PodiumEntry) {
  return {
    steam_id: entry.player_steam_id,
    name: entry.player_name,
    avatar_url: entry.player_avatar_url,
    custom_avatar_url: entry.player_custom_avatar_url,
    country: entry.player_country,
  };
}
</script>

<template>
  <div class="lb-board">
    <div class="lb-podium">
      <template v-for="slot in podium" :key="slot.place">
        <NuxtLink
          v-if="slot.entry"
          :to="{
            name: 'players-id',
            params: { id: slot.entry.player_steam_id },
          }"
          class="lb-pod"
          :class="{
            'lb-pod--first': slot.place === 1,
            'lb-pod--me': slot.entry.player_steam_id === meSteamId,
            'lb-pod--highlight':
              slot.entry.player_steam_id === highlightedSteamId,
          }"
          :style="{ '--medal': PLACE_COLORS[slot.place - 1] }"
          :data-steam-id="slot.entry.player_steam_id"
        >
          <span class="lb-pod-place">{{ slot.place }}</span>
          <PlayerDisplay
            :player="playerOf(slot.entry)"
            :show-name="false"
            :show-flag="false"
            :show-role="false"
            :show-elo="false"
            :show-online="false"
            :linkable="false"
            :context-menu="false"
            class="min-h-0"
          />
          <span class="lb-pod-who">
            <TimezoneFlag :country="slot.entry.player_country ?? undefined" />
            <span class="truncate">{{ slot.entry.player_name }}</span>
            <LeaderboardYouTag
              v-if="slot.entry.player_steam_id === meSteamId"
            />
          </span>
          <span v-if="isAwards" class="lb-medals">
            <span
              v-for="medal in MEDALS"
              :key="medal.field"
              :class="!slot.entry[medal.field] && 'opacity-35'"
              :style="{ color: medal.color }"
            >
              <i :style="{ background: medal.color }"></i
              >{{ slot.entry[medal.field] ?? 0 }}
            </span>
          </span>
          <span
            v-else
            class="lb-pod-value"
            :style="{ color: valueColor(slot.entry) }"
            >{{ formatValue(slot.entry) }}</span
          >
          <span
            v-if="isAwards"
            class="lb-pod-meta"
            :style="{ color: AWARD_COLORS.mvp }"
            >{{ $t("pages.leaderboard.col.mvp") }}
            {{ slot.entry.matches_played ?? 0 }}</span
          >
          <span v-else-if="meta(slot.entry)" class="lb-pod-meta">{{
            meta(slot.entry)
          }}</span>
        </NuxtLink>
        <div
          v-else
          class="lb-pod lb-pod--empty"
          :style="{ '--medal': PLACE_COLORS[slot.place - 1] }"
        >
          {{ $t("pages.leaderboard.podium_empty") }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lb-board {
  container: lb-board / inline-size;
}

.lb-podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 0.75rem;
}
.lb-pod {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.375rem;
  min-width: 0;
  padding: 1.125rem 0.875rem 1rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  background:
    radial-gradient(
      120% 70% at 50% 0%,
      color-mix(in srgb, var(--medal) 9%, transparent),
      transparent 70%
    ),
    hsl(var(--card));
  text-align: center;
  cursor: pointer;
  transition:
    border-color 150ms ease-out,
    box-shadow 150ms ease-out;
}
.lb-pod--first {
  padding-top: 2.125rem;
  border-color: color-mix(in srgb, var(--medal) 32%, hsl(var(--border)));
}
.lb-pod--me {
  box-shadow: inset 0 0 0 1px hsl(var(--tac-amber) / 0.4);
}
.lb-pod--highlight {
  border-color: hsl(var(--tac-amber));
  box-shadow: inset 0 0 0 1px hsl(var(--tac-amber) / 0.45);
}
.lb-pod--empty {
  min-height: 9.375rem;
  place-content: center;
  border-style: dashed;
  background: transparent;
  color: hsl(var(--muted-foreground) / 0.7);
  font-size: 0.75rem;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .lb-pod:not(.lb-pod--empty):not(.lb-pod--highlight):hover {
    border-color: hsl(var(--foreground) / 0.25);
  }
}
.lb-pod:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.lb-pod-place {
  position: absolute;
  top: 0.625rem;
  left: 0.75rem;
  color: var(--medal);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.lb-pod-who {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  max-width: 100%;
  margin-top: 0.25rem;
  font-weight: 600;
}
.lb-pod-value {
  @apply font-mono;
  font-size: 1.625rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.lb-pod--first .lb-pod-value {
  font-size: 2rem;
}
.lb-pod-meta {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.lb-medals {
  display: inline-flex;
  gap: 0.625rem;
  @apply font-mono;
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.lb-medals > span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.lb-medals i {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 9999px;
}

@container lb-board (max-width: 560px) {
  .lb-podium {
    gap: 0.5rem;
  }
  .lb-pod {
    gap: 0.25rem;
    padding: 1.625rem 0.375rem 0.75rem;
  }
  .lb-pod--first {
    padding-top: 2.5rem;
  }
  .lb-pod-place {
    top: 0.5rem;
    left: 0.5625rem;
    font-size: 0.9375rem;
  }
  .lb-pod-who {
    font-size: 0.8rem;
  }
  .lb-pod-who > :first-child {
    display: none;
  }
  .lb-pod-value {
    font-size: 1.0625rem;
  }
  .lb-pod--first .lb-pod-value {
    font-size: 1.25rem;
  }
  .lb-pod-meta {
    display: none;
  }
  .lb-pod--empty {
    min-height: 6rem;
  }
  .lb-medals {
    gap: 0.4rem;
    font-size: 0.75rem;
  }
}
</style>
