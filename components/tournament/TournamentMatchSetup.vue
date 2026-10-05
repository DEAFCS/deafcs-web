<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import MatchOptionsDisplay from "~/components/match/MatchOptionsDisplay.vue";
import { matchTypeColorStyle } from "~/utilities/matchTypeColors";

// Overview "Match Setup": the answers players look for before joining (mode,
// format, best of, veto, substitutes, maps) without opening Match Settings.
// Concept adapted from 5Stack's richer tournament detail (MIT); DEAFCS
// styling and the existing MatchOptionsDisplay for maps and full settings.
const props = defineProps<{
  tournament: any;
  format?: string | null;
}>();

const { t } = useI18n();

const options = computed(() => props.tournament?.options ?? null);
const isDuel = computed(() => options.value?.type === "Duel");

// The effective allowance, from the same capacity the API enforces
// (tournament_max/min_players_per_lineup), never a separate tournament count.
const effectiveSubstitutes = computed(() => {
  const max = props.tournament?.max_players_per_lineup;
  const min = props.tournament?.min_players_per_lineup;
  if (typeof max !== "number" || typeof min !== "number") return null;
  return Math.max(0, max - min);
});

const substitutesEnabled = computed(
  () => props.tournament?.substitutes_enabled !== false && (effectiveSubstitutes.value ?? 1) > 0,
);

type StageRow = {
  id: string;
  label: string;
  bestOf: number | null;
  deciderBestOf: number | null;
  ownPoolCount: number | null;
};

const stageRows = computed<StageRow[]>(() => {
  const poolId = options.value?.map_pool?.id ?? null;
  return [...(props.tournament?.stages ?? [])]
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .map((stage: any, index: number) => {
      const stagePool = stage.options?.map_pool;
      return {
        id: stage.id,
        label: [
          t("tournament.page.match_setup.stage", { number: index + 1 }),
          stage.e_tournament_stage_type?.description ?? stage.type,
        ]
          .filter(Boolean)
          .join(" · "),
        bestOf:
          stage.default_best_of ||
          stage.options?.best_of ||
          options.value?.best_of ||
          null,
        deciderBestOf: stage.decider_best_of || null,
        ownPoolCount:
          stagePool && stagePool.id !== poolId
            ? (stagePool.maps?.length ?? 0)
            : null,
      };
    });
});

const singleStage = computed(() =>
  stageRows.value.length === 1 ? stageRows.value[0] : null,
);
// Several stages may differ, so they get their own rows below instead.
const bestOfLabel = computed(() => {
  if (stageRows.value.length > 1) return null;
  const stage = singleStage.value;
  const bestOf = stage ? stage.bestOf : options.value?.best_of;
  return bestOf ? `BO${bestOf}` : null;
});

const mapCount = computed(() => options.value?.map_pool?.maps?.length ?? 0);
</script>

<template>
  <div v-if="options" class="grid gap-4" data-testid="tournament-match-setup">
    <dl class="m-0 grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-5">
      <div class="grid min-w-0 gap-1">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.match_setup.mode") }}
        </dt>
        <dd class="m-0">
          <span
            :style="matchTypeColorStyle(options.type)"
            class="inline-flex items-center rounded border border-[rgb(var(--mode-rgb)_/_0.4)] bg-[rgb(var(--mode-rgb)_/_0.12)] px-[0.55rem] py-[0.2rem] font-mono text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[rgb(var(--mode-rgb))]"
            data-testid="tournament-match-setup-mode"
          >
            {{ options.type }}
          </span>
        </dd>
      </div>

      <div v-if="format" class="grid min-w-0 gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.match_setup.format") }}
        </dt>
        <dd class="m-0 text-[0.8125rem] font-semibold">{{ format }}</dd>
      </div>

      <div v-if="bestOfLabel" class="grid min-w-0 gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.match_setup.best_of") }}
        </dt>
        <dd
          class="m-0 text-[0.8125rem] font-semibold tabular-nums"
          data-testid="tournament-match-setup-best-of"
        >
          {{ bestOfLabel }}
          <span
            v-if="singleStage?.deciderBestOf"
            class="block text-xs font-medium text-foreground/70"
          >
            {{
              $t("tournament.page.match_setup.decider", {
                best_of: singleStage.deciderBestOf,
              })
            }}
          </span>
        </dd>
      </div>

      <div class="grid min-w-0 gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.match_setup.map_veto") }}
        </dt>
        <dd class="m-0 text-[0.8125rem] font-semibold">
          {{
            options.map_veto
              ? $t("tournament.page.match_setup.on")
              : $t("tournament.page.match_setup.off")
          }}
          <span
            v-if="mapCount"
            class="block text-xs font-medium text-foreground/70"
          >
            {{ $t("tournament.page.match_setup.maps", { count: mapCount }) }}
          </span>
        </dd>
      </div>

      <div v-if="!isDuel" class="grid min-w-0 gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.match_setup.substitutes") }}
        </dt>
        <dd
          class="m-0 text-[0.8125rem] font-semibold"
          :class="substitutesEnabled ? '' : 'text-muted-foreground'"
          data-testid="tournament-match-setup-substitutes"
        >
          {{
            substitutesEnabled
              ? $t("tournament.page.match_setup.enabled")
              : $t("tournament.page.match_setup.disabled")
          }}
        </dd>
      </div>
    </dl>

    <!-- Only when stages differ: one row each, so a BO1 group stage with a
         BO3 final reads accurately instead of showing one number. -->
    <ul
      v-if="stageRows.length > 1"
      class="m-0 grid list-none gap-1 p-0 text-xs text-muted-foreground"
      data-testid="tournament-match-setup-stages"
    >
      <li v-for="stage in stageRows" :key="stage.id" class="flex flex-wrap gap-x-1.5">
        <span class="font-medium text-foreground">{{ stage.label }}</span>
        <span v-if="stage.bestOf" class="tabular-nums">· BO{{ stage.bestOf }}</span>
        <span v-if="stage.deciderBestOf" class="tabular-nums">
          ·
          {{
            $t("tournament.page.match_setup.decider", {
              best_of: stage.deciderBestOf,
            })
          }}
        </span>
        <span v-if="stage.ownPoolCount !== null">
          ·
          {{
            $t("tournament.page.match_setup.own_map_pool", {
              count: stage.ownPoolCount,
            })
          }}
        </span>
      </li>
    </ul>

    <MatchOptionsDisplay
      :show-details-by-default="false"
      :options="options"
      :min-role="tournament.min_role"
      :substitutes="isDuel ? 0 : effectiveSubstitutes"
    />
  </div>
</template>
