<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";
import {
  formatCopenhagenTournamentTime,
  formatLocalTournamentClock,
  formatLocalTournamentDateTime,
  formatLocalTournamentZoneTime,
  isCopenhagenTimeZone,
  localTimeZoneName,
  type TournamentTimeInput,
} from "~/utilities/tournamentTime";

const props = withDefaults(
  defineProps<{
    value: TournamentTimeInput;
    display?: "date-time" | "time";
  }>(),
  {
    display: "date-time",
  },
);
const { t } = useI18n();

const date = computed(() => {
  if (props.value === null || props.value === undefined || props.value === "") {
    return null;
  }
  const parsed =
    props.value instanceof Date
      ? new Date(props.value.getTime())
      : new Date(props.value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
});

const localLabel = computed(() =>
  props.display === "time"
    ? formatLocalTournamentClock(date.value)
    : formatLocalTournamentDateTime(date.value),
);
// The timezone lives in the tooltip only (hover, focus or tap), never as an
// always-visible line: "10 Oct 14:00 CEST", from the viewer's own zone.
const localZoneLabel = computed(() =>
  formatLocalTournamentZoneTime(date.value),
);
const localNotice = computed(() =>
  t("common.time.local_notice", { timezone: localTimeZoneName() }),
);
const showCopenhagen = computed(() => !isCopenhagenTimeZone());
const copenhagenLabel = computed(() =>
  formatCopenhagenTournamentTime(date.value),
);
const localAriaLabel = computed(
  () => `${localZoneLabel.value}. ${t("common.time.local_time")}`,
);
</script>

<template>
  <FiveStackToolTip v-if="date && localLabel" as-child tap-toggle>
    <template #trigger>
      <button
        type="button"
        class="inline-flex cursor-help items-baseline rounded-sm border-b border-dotted border-current bg-transparent p-0 font-[inherit] text-[inherit] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        :aria-label="localAriaLabel"
      >
        <time :datetime="date.toISOString()">{{ localLabel }}</time>
      </button>
    </template>
    <span class="grid gap-0.5">
      <span class="font-semibold tabular-nums" data-testid="tournament-time-zone">
        {{ localZoneLabel }}
      </span>
      <span class="text-muted-foreground">{{ localNotice }}</span>
      <span v-if="showCopenhagen">
        <span class="font-semibold">{{ t("common.time.copenhagen") }}:</span>
        <span class="ml-1 tabular-nums">{{ copenhagenLabel }}</span>
      </span>
    </span>
  </FiveStackToolTip>
</template>
