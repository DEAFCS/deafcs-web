<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Radio, Trophy } from "lucide-vue-next";
import MapDisplay from "~/components/MapDisplay.vue";
import MatchTypeBadge from "~/components/MatchTypeBadge.vue";
import { watchModeLabel, type TickerCellModel } from "~/components/watch/watchTicker";

// One match on the /watch rail. Layout follows 5Stack's ticker cell
// (status line, two team rows, tag), dressed in the DEAFCS match identity:
// the map background (one map for a BO1, every map side by side for a BO3,
// same as MatchTableRow), the mode badge colours and the BO pill. The whole
// card opens the match page; streams are only announced here, never played.
const props = defineProps<{
  model: TickerCellModel;
  // "LIVE · 2 STREAMS", already null for the viewer's own match.
  streamLabel?: string | null;
}>();

const { t } = useI18n();

const apiDomain = useRuntimeConfig().public.apiDomain;
function avatarSrc(path: string) {
  return /^https?:\/\//.test(path) ? path : `https://${apiDomain}/${path}`;
}

const ariaLabel = computed(() =>
  [
    `${props.model.teams[0].name} – ${props.model.teams[1].name}`,
    props.model.status.text,
    props.model.checkIn
      ? t("pages.watch.ticker.check_in", props.model.checkIn)
      : props.model.status.detail,
    props.model.teams[0].score !== null
      ? `${props.model.teams[0].score}–${props.model.teams[1].score}`
      : null,
    props.streamLabel,
  ]
    .filter(Boolean)
    .join(", "),
);

const checkInWidth = computed(() =>
  props.model.checkIn
    ? `${(props.model.checkIn.checked / props.model.checkIn.total) * 100}%`
    : "0%",
);
</script>

<template>
  <NuxtLink
    :to="{ name: 'matches-id', params: { id: model.id } }"
    :aria-label="ariaLabel"
    data-testid="watch-match-card"
    :data-kind="model.kind"
    class="group relative flex h-[7.75rem] w-60 shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-black text-left transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    :class="
      model.kind === 'pre'
        ? 'border-[hsl(var(--tac-amber)/0.45)] hover:border-[hsl(var(--tac-amber)/0.8)]'
        : model.kind === 'live'
          ? 'border-destructive/45 hover:border-destructive/80'
          : 'border-border hover:border-primary/30'
    "
  >
    <!-- Map background: decorative, permanently darkened. -->
    <div class="absolute inset-0 flex" aria-hidden="true" data-testid="watch-card-maps">
      <template v-if="model.maps.length > 0">
        <MapDisplay
          v-for="matchMap in model.maps"
          :key="matchMap.id"
          :map="matchMap.map"
          :patch="false"
          loading="lazy"
          class="min-w-0 flex-1 rounded-none [&>div]:hidden"
          data-testid="watch-card-map"
        />
      </template>
      <NuxtImg
        v-else
        src="/img/maps/screenshots/default.webp"
        class="h-full w-full object-cover"
        sizes="240px"
        loading="lazy"
        alt=""
      />
      <div class="absolute inset-0 bg-gradient-to-b from-black/65 via-black/75 to-black/90"></div>
    </div>

    <div class="relative z-10 flex h-full flex-col gap-1 px-3 pb-2.5 pt-2">
      <span class="flex h-4 items-center justify-between gap-2 text-xs text-white/70">
        <span
          class="inline-flex min-w-0 items-center gap-1.5 truncate tabular-nums"
          :class="{
            'font-semibold text-white': model.kind === 'live' || model.kind === 'upcoming',
            'font-bold text-[hsl(var(--tac-amber))]': model.kind === 'pre',
          }"
        >
          <span v-if="model.status.dot" class="relative inline-flex size-2 shrink-0">
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none"
              :class="model.status.dot === 'live' ? 'bg-destructive' : 'bg-[hsl(var(--tac-amber))]'"
            ></span>
            <span
              class="relative inline-flex size-2 rounded-full"
              :class="model.status.dot === 'live' ? 'bg-destructive' : 'bg-[hsl(var(--tac-amber))]'"
            ></span>
          </span>
          <span class="truncate">{{ model.status.text }}</span>
        </span>
        <span class="inline-flex shrink-0 items-center gap-1">
          <MatchTypeBadge
            v-if="model.mode"
            :type="model.mode"
            :label="watchModeLabel(model.mode)"
            size="compact"
            data-testid="watch-card-mode"
          />
          <span
            class="inline-flex items-center rounded border border-white/20 bg-black/40 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase leading-none tracking-[0.12em] text-white/80"
            >BO{{ model.bestOf }}</span
          >
        </span>
      </span>

      <span
        v-for="(team, i) in model.teams"
        :key="i"
        class="flex min-w-0 items-center gap-2 text-[13px] font-semibold"
        :class="
          team.emphasis === 'trail' || (model.kind === 'result' && team.emphasis !== 'win')
            ? 'text-white/60'
            : 'text-white'
        "
      >
        <img
          v-if="team.avatar"
          :src="avatarSrc(team.avatar)"
          alt=""
          class="size-5 shrink-0 rounded-[4px] object-cover"
          loading="lazy"
        />
        <span
          v-else
          aria-hidden="true"
          class="inline-grid size-5 shrink-0 place-items-center rounded-[4px] bg-white/10 text-[0.6rem] font-extrabold tracking-wide text-white/85"
          >{{ team.monogram }}</span
        >
        <span class="min-w-0 flex-1 truncate" :class="{ 'font-bold': team.emphasis === 'win' }" :title="team.name">{{
          team.name
        }}</span>
        <span v-if="team.pips" class="inline-flex shrink-0 gap-[3px]">
          <i
            v-for="p in team.pips.total"
            :key="p"
            class="size-1.5 rounded-[1px]"
            :class="p <= team.pips.won ? 'bg-[hsl(var(--tac-amber))]' : 'bg-white/25'"
          ></i>
        </span>
        <span
          v-if="team.score !== null"
          class="min-w-[1.125rem] text-right text-sm tabular-nums"
          :class="{ 'font-bold': team.emphasis !== 'trail' }"
          >{{ team.score }}</span
        >
        <span
          v-else-if="team.checkIn"
          class="inline-flex shrink-0 items-center gap-[3px] text-xs tabular-nums"
          :class="team.checkIn.checked >= team.checkIn.total ? 'font-bold text-[hsl(var(--tac-amber))]' : 'text-white/60'"
        >
          <Check v-if="team.checkIn.checked >= team.checkIn.total" class="size-3" :stroke-width="3" aria-hidden="true" />
          {{ team.checkIn.checked }}/{{ team.checkIn.total }}
        </span>
      </span>

      <span class="mt-auto flex min-w-0 items-center justify-between gap-2 text-[11px] text-white/60">
        <span v-if="model.tag" class="inline-flex min-w-0 items-center gap-1 truncate">
          <Trophy class="size-3 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ model.tag }}</span>
        </span>
        <span v-else-if="model.you" class="inline-flex items-center gap-1 font-semibold text-[hsl(var(--tac-amber))]">
          <span class="size-1.5 rounded-full bg-[hsl(var(--tac-amber))]"></span>
          {{ $t("pages.watch.ticker.you") }}
        </span>
        <span v-else></span>
        <span
          v-if="streamLabel"
          data-testid="watch-stream-indicator"
          class="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/50 bg-destructive/15 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase leading-none tracking-[0.12em] text-white"
        >
          <Radio class="size-3" aria-hidden="true" />
          {{ streamLabel }}
        </span>
      </span>
    </div>

    <span v-if="model.checkIn" aria-hidden="true" class="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-white/15">
      <span
        class="block h-full bg-[hsl(var(--tac-amber))] transition-[width] duration-300 motion-reduce:transition-none"
        :style="{ width: checkInWidth }"
      ></span>
    </span>
  </NuxtLink>
</template>
