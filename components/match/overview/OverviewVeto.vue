<script lang="ts" setup>
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import mapLabel from "~/utilities/mapLabel";
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="overview-veto">
    <div
      v-if="canOverride"
      class="flex cursor-pointer items-center justify-center gap-2 text-xs text-muted-foreground"
      data-testid="veto-override"
      @click="override = !override"
    >
      <Label class="cursor-pointer text-xs text-muted-foreground">
        {{ $t("match.map_veto.organizer_override") }}
      </Label>
      <Switch :model-value="override" />
    </div>

    <!-- Side choice: the map just picked, CT or T. -->
    <div
      v-if="pickType === 'Side' && sideMap"
      class="relative overflow-hidden rounded-xl border border-border"
      data-testid="veto-side-choice"
    >
      <img
        v-if="sideMap.poster"
        :src="sideMap.poster"
        alt=""
        class="absolute inset-0 h-full w-full object-cover brightness-[0.35]"
      />
      <div class="relative flex flex-col items-center gap-4 p-5">
        <span
          class="font-sans text-2xl font-bold uppercase tracking-[0.2em] text-white"
          data-testid="veto-side-map"
        >
          {{ mapLabel(sideMap) }}
        </span>
        <div class="flex items-center gap-4">
          <component
            :is="isPicking ? 'button' : 'div'"
            v-for="option in sideOptions"
            :key="option.value"
            :type="isPicking ? 'button' : undefined"
            class="side-option flex flex-col items-center gap-2 rounded-lg border px-5 py-3"
            :class="[
              selectedSide === option.value ? 'is-selected' : '',
              isPicking ? 'is-pickable' : '',
            ]"
            :disabled="isPicking ? submitting : undefined"
            :data-testid="`veto-side-${option.short}`"
            @click="isPicking && !submitting && (selectedSide = option.value)"
          >
            <img :src="option.img" alt="" class="h-12 w-12 drop-shadow-xl" />
            <span class="font-mono text-xs font-bold tracking-[0.18em] text-white">
              {{ option.short }}
            </span>
          </component>
        </div>
      </div>
      <div
        v-if="confirmation && selectedSide"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/95 p-2 text-center"
        :style="{ '--accent': accent }"
        data-testid="veto-confirm"
        role="group"
        :aria-label="confirmation.question"
        @keydown.esc.stop="!submitting && cancelSelection()"
      >
        <span class="text-xs font-semibold" data-testid="veto-confirm-question">
          {{ confirmation.question }}
        </span>
        <div class="flex w-full flex-wrap justify-center gap-1">
          <Button
            variant="outline"
            size="sm"
            :disabled="submitting"
            data-testid="veto-confirm-cancel"
            @click.stop="cancelSelection"
          >
            {{ $t("common.cancel") }}
          </Button>
          <Button
            size="sm"
            :disabled="submitting"
            data-testid="veto-confirm-submit"
            @click.stop="submit"
          >
            <Spinner v-if="submitting" class="h-4 w-4" />
            {{ confirmation.action }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Map pool: every map's state, and the picker's selection. -->
    <div
      v-else
      class="flex w-full flex-wrap justify-center gap-2"
      data-testid="veto-maps"
    >
      <component
        :is="canSelect(row) && selectedMapId !== row.map.id ? 'button' : 'div'"
        v-for="row in mapRows"
        :key="row.map.id"
        :type="canSelect(row) && selectedMapId !== row.map.id ? 'button' : undefined"
        class="veto-map relative w-[calc((100%_-_0.5rem)/2)] aspect-[4/3] overflow-hidden rounded-lg border text-left sm:w-[calc((100%_-_1rem)/3)]"
        :class="[
          `is-${row.state}`,
          row.team ? `team-${row.team}` : '',
          selectedMapId === row.map.id ? 'is-selected min-h-36' : '',
          canSelect(row) ? 'is-pickable' : '',
        ]"
        :data-state="row.state"
        :data-team="row.team ?? undefined"
        :data-testid="`veto-map-${row.map.id}`"
        @click="canSelect(row) && selectMap(row.map.id)"
      >
        <img
          v-if="row.map.poster"
          :src="row.map.poster"
          alt=""
          class="absolute inset-0 h-full w-full object-cover"
        />
        <div class="veto-map-shade absolute inset-0"></div>
        <div class="relative flex h-full flex-col justify-between p-2">
          <span
            v-if="row.state !== 'available'"
            class="veto-map-tag self-start rounded px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-[0.14em]"
          >
            {{ $t(`match.lifecycle.map_${row.state}`) }}
            <template v-if="row.team"> · T{{ row.team }}</template>
          </span>
          <span v-else></span>
          <span
            class="truncate font-sans text-sm font-bold uppercase tracking-[0.12em] text-white"
            :class="row.state === 'banned' ? 'line-through opacity-70' : ''"
          >
            {{ mapLabel(row.map) }}
          </span>
        </div>
        <div
          v-if="confirmation && selectedMapId === row.map.id"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/95 p-2 text-center"
          :style="{ '--accent': accent }"
          data-testid="veto-confirm"
          role="group"
          :aria-label="confirmation.question"
          @keydown.esc.stop="!submitting && cancelSelection()"
        >
          <span class="text-xs font-semibold" data-testid="veto-confirm-question">
            {{ confirmation.question }}
          </span>
          <div class="flex w-full flex-wrap justify-center gap-1">
            <Button
              variant="outline"
              size="sm"
              :disabled="submitting"
              data-testid="veto-confirm-cancel"
              @click.stop="cancelSelection"
            >
              {{ $t("common.cancel") }}
            </Button>
            <Button
              size="sm"
              :disabled="submitting"
              data-testid="veto-confirm-submit"
              @click.stop="submit"
            >
              <Spinner v-if="submitting" class="h-4 w-4" />
              {{ confirmation.action }}
            </Button>
          </div>
        </div>
      </component>
    </div>
  </section>
</template>

<script lang="ts">
import { e_player_roles_enum, e_sides_enum } from "~/generated/zeus";
import { mapVetoPickMutation } from "~/graphql/mapVetoPick";
import { vetoMapStates } from "~/utilities/matchLifecycle";
import { useSound } from "~/composables/useSound";
import { toast } from "@/components/ui/toast";

/**
 * The Overview's veto: map cards, CT/T and the captain's confirmation. The
 * action is the same insert MatchMapVeto sends (mapVetoPickMutation) with
 * the same variables; whose turn it is comes from the match's own computed
 * fields, and Postgres (verify_map_veto_pick) remains the authority.
 */
export default {
  props: {
    match: {
      type: Object,
      required: true,
    },
    picks: {
      type: Array,
      default: () => [],
    },
    // Accent of the side on the clock, for the selected-card confirmation.
    accent: {
      type: String,
      default: "var(--tac-amber)",
    },
  },
  data() {
    return {
      override: false,
      submitting: false,
      selectedMapId: null as string | null,
      selectedSide: null as string | null,
      submitTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
      remainingSeconds: 0,
      countdownInterval: undefined as ReturnType<typeof setInterval> | undefined,
      sounds: useSound(),
    };
  },
  watch: {
    isPicking(isPicking: boolean) {
      this.cancelSelection();
      if (isPicking) this.sounds.playMatchFoundSound();
    },
    pickType() {
      this.cancelSelection();
    },
    picks(current: any[], previous: any[]) {
      if (previous && current.length > previous.length) {
        this.sounds.playTickSound();
        this.finishSubmitting();
      }
    },
    "match.map_veto_pick_expires_at": {
      immediate: true,
      handler() {
        this.updateCountdown();
      },
    },
  },
  mounted() {
    if (this.isPicking) this.sounds.playMatchFoundSound();
    this.countdownInterval = setInterval(this.updateCountdown, 1000);
  },
  beforeUnmount() {
    if (this.submitTimeout) clearTimeout(this.submitTimeout);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  },
  methods: {
    updateCountdown() {
      const expiresAt = this.match?.map_veto_pick_expires_at;
      const seconds = expiresAt
        ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
        : 0;
      // Same warning ticks MatchMapVeto plays in the last five seconds.
      if (seconds > 0 && seconds <= 5 && seconds !== this.remainingSeconds) {
        this.sounds.playCountdownSound();
      }
      this.remainingSeconds = seconds;
    },
    canSelect(row: { state: string }) {
      return (
        this.isPicking &&
        !this.submitting &&
        (this.pickType === "Ban" || this.pickType === "Pick") &&
        row.state === "available"
      );
    },
    selectMap(mapId: string) {
      this.selectedMapId = mapId;
      this.$nextTick(() => this.$el.querySelector('[data-testid="veto-confirm-cancel"]')?.focus());
    },
    cancelSelection() {
      const previousMapId = this.selectedMapId;
      if (previousMapId) this.$nextTick(() => this.$el?.querySelector(`[data-testid="veto-map-${previousMapId}"]`)?.focus());
      this.selectedMapId = null;
      this.selectedSide = null;
    },
    finishSubmitting() {
      if (this.submitTimeout) {
        clearTimeout(this.submitTimeout);
        this.submitTimeout = undefined;
      }
      this.submitting = false;
      this.cancelSelection();
    },
    async submit() {
      if (this.submitting || !this.confirmation || !this.isPicking) return;
      const side = this.pickType === "Side" ? this.selectedSide : null;
      const mapId = this.pickType === "Side" ? this.sideMap?.id : this.selectedMapId;
      if (!mapId) return;

      this.submitting = true;
      try {
        await this.$apollo.mutate({
          mutation: mapVetoPickMutation,
          variables: {
            map_id: mapId,
            type: this.pickType,
            ...(side ? { side } : {}),
            match_id: this.match.id,
            match_lineup_id: this.match.map_veto_picking_lineup_id,
          },
        });
        // The new pick arriving settles it; this is only a fallback.
        this.submitTimeout = setTimeout(() => this.finishSubmitting(), 8000);
      } catch (error: any) {
        this.submitting = false;
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: error?.message,
        });
      }
    },
  },
  computed: {
    canOverride() {
      return (
        this.match.is_organizer ||
        useAuthStore().isRoleAbove(e_player_roles_enum.match_organizer)
      );
    },
    // Same rule as MatchMapVeto.isPicking.
    isPicking() {
      if (this.canOverride && this.override) return true;
      if (this.match.is_organizer && !this.match.is_captain) return false;
      return !!(
        this.match.lineup_1?.can_pick_map_veto ||
        this.match.lineup_2?.can_pick_map_veto
      );
    },
    pickType() {
      return this.match.map_veto_type;
    },
    mapRows() {
      return vetoMapStates(this.match, this.picks as any[]);
    },
    sideMap() {
      return (this.picks as any[]).at(-1)?.map ?? null;
    },
    sideOptions() {
      return [
        { value: e_sides_enum.CT, short: "CT", img: "/img/teams/ct_logo.svg" },
        { value: e_sides_enum.TERRORIST, short: "T", img: "/img/teams/t_logo.svg" },
      ];
    },
    confirmation() {
      if (!this.isPicking) return null;
      if (this.pickType === "Side") {
        if (!this.selectedSide || !this.sideMap) return null;
        const side = this.selectedSide === e_sides_enum.CT ? "CT" : "T";
        return {
          question: this.$t("match.lifecycle.confirm_side_question", {
            side,
            map: mapLabel(this.sideMap),
          }),
          action: this.$t("match.lifecycle.confirm_side", { side }),
        };
      }
      const row = this.mapRows.find((r: any) => r.map.id === this.selectedMapId);
      if (!row || (this.pickType !== "Ban" && this.pickType !== "Pick")) return null;
      const kind = this.pickType === "Ban" ? "ban" : "pick";
      return {
        question: this.$t(`match.lifecycle.confirm_${kind}_question`, {
          map: mapLabel(row.map),
        }),
        action: this.$t(`match.lifecycle.confirm_${kind}`),
      };
    },
  },
};
</script>

<style scoped>
.veto-map {
  --tone: var(--border);
  border-color: hsl(var(--tone) / 0.7);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}
.veto-map-shade {
  background: linear-gradient(180deg, rgb(0 0 0 / 0.15) 0%, rgb(0 0 0 / 0.75) 100%);
}
.veto-map.is-banned {
  --tone: var(--destructive);
  opacity: 0.45;
  filter: grayscale(0.9);
}
.veto-map.is-picked.team-1 {
  --tone: var(--tac-amber);
  box-shadow: inset 0 0 0 1px hsl(var(--tone) / 0.6);
}
.veto-map.is-picked.team-2 {
  --tone: 200 90% 62%;
  box-shadow: inset 0 0 0 1px hsl(var(--tone) / 0.6);
}
.veto-map.is-decider {
  --tone: 0 0% 92%;
  box-shadow: inset 0 0 0 1px hsl(var(--tone) / 0.6);
}
.veto-map-tag {
  color: hsl(var(--tone));
  background: rgb(0 0 0 / 0.6);
}
.veto-map.is-pickable {
  cursor: pointer;
}
.veto-map.is-pickable:hover,
.veto-map.is-selected {
  --tone: var(--tac-amber);
  transform: translateY(-2px);
  box-shadow: 0 0 18px hsl(var(--tone) / 0.35);
}
.side-option {
  border-color: rgb(255 255 255 / 0.2);
  background: rgb(0 0 0 / 0.35);
  transition: all 0.2s ease;
}
.side-option.is-pickable {
  cursor: pointer;
}
.side-option.is-pickable:hover,
.side-option.is-selected {
  border-color: hsl(var(--tac-amber));
  box-shadow: 0 0 18px hsl(var(--tac-amber) / 0.4);
  transform: scale(1.05);
}
@media (prefers-reduced-motion: reduce) {
  .veto-map,
  .side-option {
    transition: none;
  }
}
</style>
