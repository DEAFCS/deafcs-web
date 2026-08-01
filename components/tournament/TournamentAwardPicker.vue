<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, ref, watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { LoaderCircle, RotateCcw, Save, Trophy } from "lucide-vue-next";
import AwardBadge from "~/components/award/AwardBadge.vue";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import {
  TOURNAMENT_AWARD_PLACEMENTS,
  awardsForTournamentPlacement,
  builtInAwardForPlacement,
  effectiveTournamentAwardSelection,
  placementForTournamentAwardSlot,
  sameTournamentAwardSelection,
  tournamentAwardSelectionOverrides,
  tournamentMvpEnabled,
  type TournamentAwardDefinition,
  type TournamentAwardPlacement,
  type TournamentAwardSelection,
  type TournamentAwardSlotRow,
} from "~/utilities/tournamentAwardPicker";

const AWARD_DEFINITIONS_QUERY = gql`
  query TournamentAwardPickerDefinitions {
    awards(
      where: { archived_at: { _is_null: true } }
      order_by: [{ system_key: asc_nulls_last }, { name: asc }]
    ) {
      id
      name
      description
      tier
      silhouette
      image_url
      system_key
      archived_at
      tournament_id
      event_id
      elo_season_id
      league_season_id
    }
  }
`;

const TOURNAMENT_AWARD_SLOTS_QUERY = gql`
  query TournamentAwardPickerSlots($tournamentId: uuid!) {
    tournament_award_slots(
      where: { tournament_id: { _eq: $tournamentId } }
      order_by: { slot: asc }
    ) {
      id
      tournament_id
      slot
      award_id
      custom_name
      silhouette_override
      image_override
      award {
        id
        name
        description
        tier
        silhouette
        image_url
        system_key
        archived_at
        tournament_id
        event_id
        elo_season_id
        league_season_id
      }
    }
  }
`;

const SET_TOURNAMENT_AWARD_MUTATION = gql`
  mutation SetTournamentAwardPickerSlot(
    $tournamentId: uuid!
    $placement: Int!
    $awardId: uuid!
    $customName: String
    $silhouette: Int
  ) {
    setTournamentAward(
      tournament_id: $tournamentId
      placement: $placement
      award_id: $awardId
      custom_name: $customName
      silhouette: $silhouette
    ) {
      id
      tournament_id
      placement
      award_id
      custom_name
      silhouette
      image_url
    }
  }
`;

const props = withDefaults(
  defineProps<{
    modelValue?: TournamentAwardSelection;
    tournamentId?: string | null;
    matchType?: string | null;
    minPlayersPerLineup?: number | null;
    finished?: boolean;
  }>(),
  {
    modelValue: () => ({}),
    tournamentId: null,
    matchType: null,
    minPlayersPerLineup: null,
    finished: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: TournamentAwardSelection];
  ready: [value: boolean];
}>();

const { client } = useApolloClient();
const definitions = ref<TournamentAwardDefinition[]>([]);
const slots = ref<TournamentAwardSlotRow[]>([]);
const baseline = ref<TournamentAwardSelection>({});
const loading = ref(true);
const saving = ref(false);
const loadError = ref("");
const feedback = ref("");

const mvpEnabled = computed(() =>
  tournamentMvpEnabled(props.matchType, props.minPlayersPerLineup),
);
const relevantPlacements = computed(() =>
  TOURNAMENT_AWARD_PLACEMENTS.filter(
    (config) => config.placement !== 0 || mvpEnabled.value,
  ),
);
const dirty = computed(
  () =>
    !sameTournamentAwardSelection(
      props.modelValue,
      baseline.value,
      mvpEnabled.value,
    ),
);

function setSelection(
  placement: TournamentAwardPlacement,
  awardId: string,
) {
  feedback.value = "";
  emit("update:modelValue", {
    ...props.modelValue,
    [placement]: awardId,
  });
}

function optionsFor(placement: TournamentAwardPlacement) {
  return awardsForTournamentPlacement(
    definitions.value,
    placement,
    props.tournamentId,
  );
}

function awardForId(awardId?: string | null) {
  if (!awardId) return null;
  return definitions.value.find((award) => award.id === awardId) ?? null;
}

function selectedAward(placement: TournamentAwardPlacement) {
  return awardForId(props.modelValue[placement]);
}

function definitionBadges(award: TournamentAwardDefinition | null) {
  if (!award) return [];
  const badges = [award.system_key ? "Built-in" : "Custom"];
  if (
    !award.tournament_id &&
    !award.event_id &&
    !award.elo_season_id &&
    !award.league_season_id
  ) {
    badges.push("Global reusable");
  } else if (award.tournament_id === props.tournamentId) {
    badges.push("This tournament");
  }
  return badges;
}

function slotForPlacement(placement: TournamentAwardPlacement) {
  return slots.value.find(
    (slot) => placementForTournamentAwardSlot(slot.slot) === placement,
  );
}

function mergeDefinitions(
  queried: TournamentAwardDefinition[],
  slotRows: TournamentAwardSlotRow[],
) {
  const merged = new Map(queried.map((award) => [award.id, award]));
  for (const slot of slotRows) {
    if (slot.award) merged.set(slot.award.id, slot.award);
  }
  definitions.value = [...merged.values()];
}

async function querySlots(tournamentId: string) {
  const result = await client.query<{
    tournament_award_slots: TournamentAwardSlotRow[];
  }>({
    query: TOURNAMENT_AWARD_SLOTS_QUERY,
    variables: { tournamentId },
    fetchPolicy: "network-only",
  });
  return result.data.tournament_award_slots ?? [];
}

async function loadPicker() {
  loading.value = true;
  loadError.value = "";
  feedback.value = "";
  emit("ready", false);

  try {
    const definitionsResult = await client.query<{
      awards: TournamentAwardDefinition[];
    }>({
      query: AWARD_DEFINITIONS_QUERY,
      fetchPolicy: "network-only",
    });
    const slotRows = props.tournamentId
      ? await querySlots(props.tournamentId)
      : [];

    slots.value = slotRows;
    mergeDefinitions(definitionsResult.data.awards ?? [], slotRows);
    const effective = effectiveTournamentAwardSelection(
      definitions.value,
      slotRows,
    );

    // Existing tournament state is authoritative. In the creation wizard,
    // preserve a selection that survived back/forward step navigation.
    if (props.tournamentId || Object.keys(props.modelValue).length === 0) {
      emit("update:modelValue", effective);
    }
    baseline.value = props.tournamentId ? effective : { ...props.modelValue };
  } catch (error) {
    loadError.value =
      error instanceof Error
        ? error.message
        : "Award definitions could not be loaded.";
  } finally {
    loading.value = false;
    // Creation can safely continue with backend defaults if this query fails.
    emit("ready", true);
  }
}

async function refreshSlots(tournamentId: string) {
  const slotRows = await querySlots(tournamentId);
  slots.value = slotRows;
  mergeDefinitions(definitions.value, slotRows);
  const effective = effectiveTournamentAwardSelection(
    definitions.value,
    slotRows,
  );
  baseline.value = effective;
  emit("update:modelValue", effective);
}

async function persistTarget(
  tournamentId: string,
  target: TournamentAwardSelection,
  placements: TournamentAwardPlacement[],
) {
  let saved = 0;
  for (const placement of placements) {
    const awardId = target[placement];
    if (!awardId) {
      throw new Error("Choose an award definition for every enabled slot.");
    }

    const existing = slotForPlacement(placement);
    await client.mutate({
      mutation: SET_TOURNAMENT_AWARD_MUTATION,
      variables: {
        tournamentId,
        placement,
        awardId,
        // setTournamentAward updates these columns as part of its upsert, so
        // send the existing values to preserve presentation customizations.
        customName: existing?.custom_name ?? null,
        silhouette: existing?.silhouette_override ?? null,
      },
    });
    saved += 1;
  }
  return saved;
}

async function saveChanges() {
  if (!props.tournamentId || saving.value || props.finished || !dirty.value) {
    return;
  }

  const changed = relevantPlacements.value
    .filter(
      (config) =>
        props.modelValue[config.placement] !==
        baseline.value[config.placement],
    )
    .map((config) => config.placement);

  saving.value = true;
  feedback.value = "";
  try {
    await persistTarget(props.tournamentId, props.modelValue, changed);
    await refreshSlots(props.tournamentId);
    feedback.value = "Award mappings saved.";
    toast({ title: "Award mappings saved" });
  } catch (error) {
    const description =
      error instanceof Error ? error.message : "Please try again.";
    feedback.value = `Award mappings could not be saved. ${description}`;
    toast({
      title: "Could not save award mappings",
      description,
      variant: "destructive",
    });
  } finally {
    saving.value = false;
  }
}

async function resetToDefaults() {
  if (saving.value || props.finished) return;

  const defaults: TournamentAwardSelection = { ...props.modelValue };
  for (const config of TOURNAMENT_AWARD_PLACEMENTS) {
    const builtIn = builtInAwardForPlacement(
      definitions.value,
      config.placement,
    );
    if (!builtIn) {
      feedback.value = `The built-in ${config.shortLabel} definition is unavailable.`;
      return;
    }
    defaults[config.placement] = builtIn.id;
  }
  emit("update:modelValue", defaults);

  if (!props.tournamentId) {
    feedback.value = "Default award definitions restored.";
    return;
  }

  saving.value = true;
  feedback.value = "";
  try {
    // Explicit IDs are intentional: null can resolve to the existing override.
    await persistTarget(
      props.tournamentId,
      defaults,
      relevantPlacements.value.map((config) => config.placement),
    );
    await refreshSlots(props.tournamentId);
    feedback.value = "Generic tournament award defaults restored.";
    toast({ title: "Award defaults restored" });
  } catch (error) {
    const description =
      error instanceof Error ? error.message : "Please try again.";
    feedback.value = `Defaults could not be restored. ${description}`;
    toast({
      title: "Could not restore award defaults",
      description,
      variant: "destructive",
    });
  } finally {
    saving.value = false;
  }
}

async function persistSelections(
  tournamentId: string,
  onlyOverrides = true,
) {
  if (saving.value) throw new Error("Award mappings are already being saved.");

  const placements = onlyOverrides
    ? tournamentAwardSelectionOverrides(
        props.modelValue,
        definitions.value,
        mvpEnabled.value,
      ).map((selection) => selection.placement)
    : relevantPlacements.value.map((config) => config.placement);

  if (placements.length === 0) return 0;
  saving.value = true;
  try {
    return await persistTarget(tournamentId, props.modelValue, placements);
  } finally {
    saving.value = false;
  }
}

defineExpose({ persistSelections });

onMounted(loadPicker);
watch(() => props.tournamentId, loadPicker);
</script>

<template>
  <section
    class="rounded-sm border border-border/70 bg-background/35 p-4 sm:p-5"
    aria-labelledby="tournament-award-picker-title"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div
          id="tournament-award-picker-title"
          class="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <Trophy class="h-4 w-4 text-[hsl(var(--tac-amber))]" aria-hidden="true" />
          Award definitions
        </div>
        <p class="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Choose reusable definitions for the awards calculated when this
          tournament finishes.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        :disabled="loading || saving || finished || definitions.length === 0"
        @click="resetToDefaults"
      >
        <RotateCcw class="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        Reset all to defaults
      </Button>
    </div>

    <div
      v-if="finished"
      class="mt-4 rounded-sm border border-[hsl(var(--tac-amber)_/_0.35)] bg-[hsl(var(--tac-amber)_/_0.08)] px-4 py-3 text-sm leading-relaxed"
      role="note"
    >
      Award mappings cannot be changed after completion because existing award
      occurrences are not automatically recalculated.
    </div>

    <div
      v-if="loading"
      class="mt-5 flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle
        class="h-4 w-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      Loading award definitions…
    </div>

    <div
      v-else-if="loadError"
      class="mt-5 rounded-sm border border-destructive/50 bg-destructive/10 p-4 text-sm"
      role="alert"
    >
      <p>{{ loadError }}</p>
      <p v-if="!tournamentId" class="mt-1 text-muted-foreground">
        The tournament can still be created with the automatic built-in
        defaults.
      </p>
      <Button type="button" size="sm" variant="outline" class="mt-3" @click="loadPicker">
        Retry
      </Button>
    </div>

    <div v-else class="mt-5 grid gap-4 lg:grid-cols-2">
      <div
        v-for="config in TOURNAMENT_AWARD_PLACEMENTS.filter((item) => item.placement !== 0 || mvpEnabled)"
        :key="config.slot"
        class="grid gap-2 rounded-sm border border-border/60 bg-background/45 p-3"
      >
        <label
          :id="`award-slot-label-${config.slot}`"
          class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ config.label }}
        </label>

        <Select
          :model-value="modelValue[config.placement]"
          :disabled="finished || saving"
          @update:model-value="setSelection(config.placement, String($event))"
        >
          <SelectTrigger
            class="h-auto min-h-14 py-2"
            :aria-labelledby="`award-slot-label-${config.slot}`"
          >
            <span
              v-if="selectedAward(config.placement)"
              class="flex min-w-0 items-center gap-2 text-left"
            >
              <AwardBadge
                :tournament-id="tournamentId || selectedAward(config.placement)?.id || config.slot"
                :placement="config.placement"
                :custom-name="selectedAward(config.placement)?.name"
                :image-url="selectedAward(config.placement)?.image_url"
                size="xs"
                :interactive="false"
                aria-hidden="true"
              />
              <span class="min-w-0">
                <span class="block truncate font-semibold">
                  {{ selectedAward(config.placement)?.name }}
                </span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ definitionBadges(selectedAward(config.placement)).join(" · ") }}
                </span>
              </span>
            </span>
            <span v-else class="text-muted-foreground">Choose an award</span>
          </SelectTrigger>
          <SelectContent class="max-h-80">
            <SelectItem
              v-for="award in optionsFor(config.placement)"
              :key="award.id"
              :value="award.id"
              class="h-auto py-2"
            >
              <span class="flex items-center gap-3 pr-2">
                <AwardBadge
                  :tournament-id="tournamentId || award.id"
                  :placement="config.placement"
                  :custom-name="award.name"
                  :image-url="award.image_url"
                  size="xs"
                  :interactive="false"
                  aria-hidden="true"
                />
                <span class="min-w-0">
                  <span class="block font-semibold">{{ award.name }}</span>
                  <span class="block text-xs capitalize text-muted-foreground">
                    {{ award.tier }} · {{ definitionBadges(award).join(" · ") }}
                  </span>
                </span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="!mvpEnabled"
        class="flex min-h-24 items-center rounded-sm border border-dashed border-border bg-background/30 p-4"
        role="note"
      >
        <div>
          <div
            class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            MVP award
          </div>
          <p class="mt-2 text-sm">MVP is disabled for this tournament mode.</p>
        </div>
      </div>
    </div>

    <div
      v-if="feedback"
      class="mt-4 text-sm"
      :class="feedback.includes('could not') ? 'text-destructive' : 'text-muted-foreground'"
      aria-live="polite"
    >
      {{ feedback }}
    </div>

    <div
      v-if="tournamentId && !finished && !loadError"
      class="mt-5 flex justify-end border-t border-border/60 pt-4"
    >
      <Button type="button" :disabled="saving || loading || !dirty" @click="saveChanges">
        <LoaderCircle
          v-if="saving"
          class="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <Save v-else class="mr-2 h-4 w-4" aria-hidden="true" />
        {{ saving ? "Saving…" : "Save award mappings" }}
      </Button>
    </div>
  </section>
</template>
