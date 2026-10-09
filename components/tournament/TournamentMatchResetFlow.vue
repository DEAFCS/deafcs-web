<script lang="ts" setup>
// The tournament-aware match reset (preview of the affected bracket chain,
// winner clear or reassign, optional schedule, final confirmation). One flow
// for the bracket card and the match page: both open it with the match, and the
// same ResetTournamentMatch action and its protections apply.
import { useI18n } from "vue-i18n";
import { computed, ref, watch } from "vue";
import gql from "graphql-tag";
import {
  RotateCcw,
  TriangleAlert,
  Undo2,
  Calendar as CalendarIcon,
  X,
} from "lucide-vue-next";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDateTime,
  type CalendarDate,
  toZoned,
  getLocalTimeZone,
} from "@internationalized/date";
import type { ResetMatch } from "~/types/tournamentReset";

const { t } = useI18n();
const nuxtApp = useNuxtApp();

type ResetImpact = {
  bracket_id: string;
  match_id: string | null;
  depth: number;
  round: number;
  match_number: number;
  path: string | null;
  stage_type: string;
  match_status: string | null;
  is_source: boolean;
  will_delete_match: boolean;
};

const resetDialogOpen = ref(false);
const resetConfirmDialogOpen = ref(false);
const resetLoading = ref(false);
const resetImpacts = ref<ResetImpact[]>([]);
const resetTargetWinner = ref<"clear" | "lineup1" | "lineup2">("clear");
const resetScheduledAt = ref<string>("");
const resetStartDate = ref<CalendarDate | undefined>(undefined);
const resetStartTime = ref<string | undefined>(undefined);

watch([resetStartDate, resetStartTime], () => {
  if (!resetStartDate.value || !resetStartTime.value) {
    resetScheduledAt.value = "";
    return;
  }
  const [hours, minutes] = resetStartTime.value.split(":").map(Number);
  const cdt = new CalendarDateTime(
    resetStartDate.value.year,
    resetStartDate.value.month,
    resetStartDate.value.day,
    hours,
    minutes,
  );
  resetScheduledAt.value = toZoned(cdt, getLocalTimeZone()).toAbsoluteString();
});

const checkResetDate = ({
  day,
  month,
  year,
}: {
  day: number;
  month: number;
  year: number;
}) => {
  return new Date(year, month - 1, day + 1) < new Date();
};

const clearResetSchedule = () => {
  resetStartDate.value = undefined;
  resetStartTime.value = undefined;
};
const previewAcknowledged = ref(false);
const finalAcknowledged = ref(false);
const selectedMatch = ref<ResetMatch | null>(null);

const previewResetMutation = gql`
  mutation PreviewTournamentMatchReset($matchId: uuid!) {
    PreviewTournamentMatchReset(match_id: $matchId) {
      impacts {
        bracket_id
        match_id
        depth
        round
        match_number
        path
        stage_type
        match_status
        is_source
        will_delete_match
      }
    }
  }
`;

const executeResetMutation = gql`
  mutation ResetTournamentMatch(
    $matchId: uuid!
    $winningLineupId: uuid
    $resetStatus: String
    $scheduledAt: timestamptz
  ) {
    ResetTournamentMatch(
      match_id: $matchId
      winning_lineup_id: $winningLineupId
      reset_status: $resetStatus
      scheduled_at: $scheduledAt
    ) {
      success
    }
  }
`;

const recreateMutation = gql`
  mutation RecreateTournamentBracketMatch($bracketId: uuid!) {
    RecreateTournamentBracketMatch(bracket_id: $bracketId) {
      success
      match_id
    }
  }
`;

const recreateLoading = ref(false);

const recreateMatch = async (bracket: Bracket) => {
  if (recreateLoading.value) return;
  if (!window.confirm(t("tournament.match.recreate_confirm"))) return;
  recreateLoading.value = true;
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: recreateMutation,
      variables: { bracketId: bracket.id },
    });
    toast({ title: t("tournament.match.recreate_done") });
  } catch (error: any) {
    toast({
      title: t("tournament.match.recreate_failed"),
      description: error?.message || t("toasts.please_try_again"),
      variant: "destructive",
    });
  } finally {
    recreateLoading.value = false;
  }
};

const orderedImpacts = computed(() =>
  [...resetImpacts.value].sort((a, b) => a.depth - b.depth),
);

const requiresScheduledAt = computed(() => resetTargetWinner.value === "clear");

const previewFormErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {};

  if (previewAcknowledged.value !== true) {
    errors.previewAcknowledged = "Please confirm the warning acknowledgement.";
  }

  return errors;
});

const canContinuePreviewStep = computed(
  () =>
    !resetLoading.value && Object.keys(previewFormErrors.value).length === 0,
);

const canConfirmFinalStep = computed(
  () => !resetLoading.value && finalAcknowledged.value === true,
);

const formatImpactLabel = (impact: ResetImpact): string => {
  if (impact.is_source) {
    return t("tournament_match_impact.source_reset");
  }
  if (impact.will_delete_match) {
    return t("tournament_match_impact.delete_recreate");
  }
  return t("tournament_match_impact.slot_reset");
};

const impactSummary = computed(() => ({
  deleteAndRecreate: orderedImpacts.value.filter(
    (impact) => impact.will_delete_match,
  ).length,
  resetOnly: orderedImpacts.value.filter(
    (impact) => !impact.is_source && !impact.will_delete_match,
  ).length,
}));

const getImpactToneClasses = (impact: ResetImpact): string => {
  if (impact.is_source) {
    return "border-blue-500/40 bg-blue-950/30";
  }
  if (impact.will_delete_match) {
    return "border-red-500/40 bg-red-950/30";
  }
  return "border-amber-500/40 bg-amber-950/20";
};

const getImpactBadgeVariant = (
  impact: ResetImpact,
): "default" | "secondary" | "destructive" | "outline" => {
  if (impact.is_source) return "default";
  if (impact.will_delete_match) return "destructive";
  return "outline";
};

const getWinningLineupId = (match: ResetMatch | null): string | null => {
  if (!match) return null;
  const lineup1Id = match.lineup_1_id ?? match.lineup_1?.id ?? null;
  const lineup2Id = match.lineup_2_id ?? match.lineup_2?.id ?? null;

  if (resetTargetWinner.value === "lineup1") {
    return lineup1Id;
  }
  if (resetTargetWinner.value === "lineup2") {
    return lineup2Id;
  }
  return null;
};

const getScheduledAtIso = (): string | null => {
  if (!requiresScheduledAt.value) {
    return null;
  }

  if (!resetScheduledAt.value) {
    return null;
  }

  const parsed = new Date(resetScheduledAt.value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const openResetFlow = async (match: ResetMatch) => {
  if (!match?.id) {
    return;
  }

  selectedMatch.value = match;
  resetTargetWinner.value = "clear";
  resetScheduledAt.value = "";
  resetStartDate.value = undefined;
  resetStartTime.value = undefined;
  previewAcknowledged.value = false;
  finalAcknowledged.value = false;
  resetLoading.value = true;
  resetDialogOpen.value = false;
  resetConfirmDialogOpen.value = false;

  try {
    const { data } = await nuxtApp.$apollo.defaultClient.mutate({
      mutation: previewResetMutation,
      variables: {
        matchId: match.id,
      },
    });

    resetImpacts.value = data?.PreviewTournamentMatchReset?.impacts || [];
    resetDialogOpen.value = true;
  } catch (error: any) {
    toast({
      title: t("toasts.preview_reset_failed"),
      description: error?.message || t("toasts.please_try_again"),
      variant: "destructive",
    });
  } finally {
    resetLoading.value = false;
  }
};

const continueResetFlow = () => {
  const errors = previewFormErrors.value;
  const firstError = Object.values(errors)[0];
  if (firstError) {
    toast({
      title: t("toasts.resolve_validation_errors"),
      description: firstError,
      variant: "destructive",
    });
    return;
  }

  resetDialogOpen.value = false;
  resetConfirmDialogOpen.value = true;
};

const executeResetFlow = async () => {
  if (!previewAcknowledged.value || !finalAcknowledged.value) {
    return;
  }
  if (!selectedMatch.value?.id) return;

  const targetWinnerId = getWinningLineupId(selectedMatch.value);
  if (resetTargetWinner.value !== "clear" && !targetWinnerId) {
    toast({
      title: t("toasts.set_winner_failed"),
      description: t("toasts.set_winner_failed_description"),
      variant: "destructive",
    });
    return;
  }

  const scheduledAtIso = getScheduledAtIso();
  const resolvedResetStatus =
    resetTargetWinner.value === "clear"
      ? scheduledAtIso
        ? "Scheduled"
        : "WaitingForCheckIn"
      : null;
  resetLoading.value = true;
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: executeResetMutation,
      variables: {
        matchId: selectedMatch.value.id,
        winningLineupId: targetWinnerId,
        resetStatus: resolvedResetStatus,
        scheduledAt: scheduledAtIso,
      },
    });

    resetDialogOpen.value = false;
    resetConfirmDialogOpen.value = false;
    toast({
      title: t("toasts.match_reset_applied"),
    });
  } catch (error: any) {
    toast({
      title: t("toasts.match_reset_failed"),
      description: error?.message || t("toasts.please_try_again"),
      variant: "destructive",
    });
  } finally {
    resetLoading.value = false;
  }
};

defineExpose({ open: openResetFlow, loading: resetLoading });
</script>

<template>
  <AlertDialog
    :open="resetDialogOpen"
    @update:open="(open) => (resetDialogOpen = open)"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("tournament.match.reset_title")
        }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t("tournament.match.reset_warning") }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-3 text-sm">
        <div class="font-medium">
          {{ $t("tournament.match.affected_chain_preview") }}
        </div>
        <div
          class="grid grid-cols-1 gap-2 rounded-lg border border-border/80 bg-muted/20 p-2 text-xs md:grid-cols-2"
        >
          <div
            class="rounded border border-border/80 bg-background/70 px-2 py-1"
          >
            <div class="text-muted-foreground">
              {{ $t("tournament.match.delete_recreate") }}
            </div>
            <div class="font-semibold text-foreground">
              {{ impactSummary.deleteAndRecreate }}
            </div>
          </div>
          <div
            class="rounded border border-border/80 bg-background/70 px-2 py-1"
          >
            <div class="text-muted-foreground">
              {{ $t("tournament.match.reset_only") }}
            </div>
            <div class="font-semibold text-foreground">
              {{ impactSummary.resetOnly }}
            </div>
          </div>
        </div>

        <div v-if="orderedImpacts.length === 0" class="text-muted-foreground">
          {{ $t("tournament.match.no_affected_chain") }}
        </div>
        <ul
          v-else
          class="max-h-[45vh] overflow-y-auto overflow-x-hidden space-y-2 pr-1 text-muted-foreground"
        >
          <li
            v-for="(impact, index) in orderedImpacts"
            :key="impact.bracket_id"
            class="relative pl-5"
          >
            <div
              v-if="index < orderedImpacts.length - 1"
              class="absolute left-[6px] top-4 h-[calc(100%+0.5rem)] w-px bg-border/70"
            ></div>
            <span
              class="absolute left-0 top-3 h-3 w-3 rounded-full border-2 border-background"
              :class="
                impact.is_source
                  ? 'bg-blue-400'
                  : impact.will_delete_match
                    ? 'bg-red-400'
                    : 'bg-amber-300'
              "
            ></span>

            <div
              class="rounded-md border px-3 py-2"
              :class="getImpactToneClasses(impact)"
            >
              <div class="mb-1 flex items-start justify-between gap-2">
                <div class="font-medium text-foreground">
                  {{ impact.path || "Main" }} R{{ impact.round }} M{{
                    impact.match_number
                  }}
                </div>
                <Badge
                  :variant="getImpactBadgeVariant(impact)"
                  class="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                >
                  <span v-if="impact.is_source">source</span>
                  <span v-else-if="impact.will_delete_match">delete</span>
                  <span v-else>reset</span>
                </Badge>
              </div>
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="truncate">
                  {{ formatImpactLabel(impact) }}
                </span>
                <span
                  v-if="impact.match_status"
                  class="text-muted-foreground/90"
                >
                  {{ impact.match_status }}
                </span>
              </div>
            </div>
          </li>
        </ul>

        <div
          v-if="selectedMatch"
          class="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3"
        >
          <div class="flex items-center gap-2 font-medium">
            <RotateCcw class="h-4 w-4 text-blue-300" />
            {{ $t("tournament.match.winner_after_reset") }}
          </div>
          <RadioGroup v-model="resetTargetWinner" class="gap-2">
            <div
              class="flex cursor-pointer items-center space-x-3 rounded-md border border-border bg-background/70 p-2 transition-colors hover:bg-muted/50"
              @click="resetTargetWinner = 'clear'"
            >
              <RadioGroupItem id="reset-winner-clear" value="clear" />
              <Label class="cursor-pointer text-sm" for="reset-winner-clear">
                {{ $t("tournament.match.no_winner_reset") }}
              </Label>
            </div>
            <div
              class="flex cursor-pointer items-center space-x-3 rounded-md border border-border bg-background/70 p-2 transition-colors hover:bg-muted/50"
              @click="resetTargetWinner = 'lineup1'"
            >
              <RadioGroupItem id="reset-winner-lineup1" value="lineup1" />
              <Label class="cursor-pointer text-sm" for="reset-winner-lineup1">
                {{
                  selectedMatch.lineup_1?.name ||
                  selectedMatch.lineup_1_id
                }}
              </Label>
            </div>
            <div
              class="flex cursor-pointer items-center space-x-3 rounded-md border border-border bg-background/70 p-2 transition-colors hover:bg-muted/50"
              @click="resetTargetWinner = 'lineup2'"
            >
              <RadioGroupItem id="reset-winner-lineup2" value="lineup2" />
              <Label class="cursor-pointer text-sm" for="reset-winner-lineup2">
                {{
                  selectedMatch.lineup_2?.name ||
                  selectedMatch.lineup_2_id
                }}
              </Label>
            </div>
          </RadioGroup>
          <div class="text-xs text-muted-foreground">
            {{
              resetTargetWinner === "clear"
                ? $t("tournament.match.winner_cleared_hint")
                : $t("tournament.match.winner_reassigned_hint")
            }}
          </div>

          <div
            v-if="resetTargetWinner === 'clear'"
            class="space-y-3 rounded-md border border-border bg-background/70 p-3"
          >
            <Label class="text-sm font-medium">
              {{ $t("tournament.match.scheduled_at") }}
            </Label>
            <div class="flex items-center gap-2">
              <Popover>
                <PopoverTrigger as-child>
                  <Button
                    variant="outline"
                    class="flex-1 justify-start text-left font-normal"
                    :class="{ 'text-muted-foreground': !resetStartDate }"
                  >
                    <CalendarIcon class="mr-2 h-4 w-4" />
                    {{ resetStartDate || $t("common.pick_date") }}
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0 z-[80]">
                  <Calendar
                    :is-date-disabled="checkResetDate"
                    v-model="resetStartDate"
                    initial-focus
                  />
                </PopoverContent>
              </Popover>

              <Input
                type="time"
                v-model="resetStartTime"
                style="color-scheme: dark"
                class="w-[120px]"
              />

              <Button
                type="button"
                variant="outline"
                size="icon"
                :disabled="!resetStartDate && !resetStartTime"
                @click.prevent="clearResetSchedule"
                :title="$t('match.schedule.reset')"
              >
                <X class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ $t("tournament.match.scheduled_optional_hint") }}
            </p>
          </div>
        </div>

        <div
          class="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 cursor-pointer"
          @click="previewAcknowledged = !previewAcknowledged"
        >
          <div class="flex items-start gap-2">
            <input
              id="preview-reset-ack"
              v-model="previewAcknowledged"
              type="checkbox"
              class="mt-0.5 h-4 w-4 cursor-pointer rounded border border-amber-300/80 bg-background accent-amber-400"
              @click.stop
            />
            <div class="space-y-1">
              <div class="cursor-pointer text-sm font-medium text-amber-100">
                {{ $t("tournament.match.remove_downstream_ack") }}
              </div>
              <div class="text-xs text-amber-200/80">
                {{ $t("tournament.match.review_chain_hint") }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel :disabled="resetLoading">{{
          $t("common.cancel")
        }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="!canContinuePreviewStep"
          @click="continueResetFlow"
        >
          {{ $t("tournament.match.continue") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog
    :open="resetConfirmDialogOpen"
    @update:open="(open) => (resetConfirmDialogOpen = open)"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("tournament.match.final_confirmation_required")
        }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t("tournament.match.reset_chain_warning") }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div
        class="rounded-lg border border-red-500/40 bg-red-950/25 p-3 cursor-pointer"
        @click="finalAcknowledged = !finalAcknowledged"
      >
        <div class="mb-2 flex items-center gap-2 text-red-100">
          <TriangleAlert class="h-4 w-4" />
          <span class="text-sm font-medium">{{
            $t("tournament.match.irreversible_action")
          }}</span>
        </div>
        <div class="flex items-start gap-2 text-sm">
          <input
            id="final-reset-ack"
            v-model="finalAcknowledged"
            type="checkbox"
            class="mt-0.5 h-4 w-4 cursor-pointer rounded border border-red-300/80 bg-background accent-red-500"
            @click.stop
          />
          <span class="cursor-pointer leading-5 text-red-100">
            {{ $t("tournament.match.confirm_reset_chain_ack") }}
          </span>
        </div>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="resetLoading">{{
          $t("common.cancel")
        }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="!canConfirmFinalStep"
          @click="executeResetFlow"
        >
          <Undo2 class="mr-1 h-4 w-4" />
          {{ $t("tournament.match.confirm_reset") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
