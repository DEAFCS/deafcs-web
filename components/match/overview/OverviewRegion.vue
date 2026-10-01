<script lang="ts" setup>
import { Check, X } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="overview-region">
    <div
      v-if="canOverride"
      class="flex cursor-pointer items-center justify-center gap-2 text-xs text-muted-foreground"
      data-testid="region-override"
      @click="override = !override"
    >
      <Label class="cursor-pointer text-xs text-muted-foreground">
        {{ $t("match.region_veto.organizer_override") }}
      </Label>
      <Switch :model-value="override" />
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="region-cards">
      <component
        :is="canSelect(row) ? 'button' : 'div'"
        v-for="row in rows"
        :key="row.value"
        :type="canSelect(row) ? 'button' : undefined"
        class="region-card relative flex min-h-[5.5rem] flex-col justify-between gap-2 overflow-hidden rounded-lg border p-3 text-left"
        :class="[
          `is-${row.state}`,
          row.team ? `team-${row.team}` : '',
          selected === row.value ? 'is-chosen' : '',
          canSelect(row) ? 'is-pickable' : '',
        ]"
        :data-state="row.state"
        :data-team="row.team ?? undefined"
        :data-testid="`region-${row.value}`"
        @click="canSelect(row) && (selected = row.value)"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="{
              'bg-green-500': row.status === 'Online',
              'bg-yellow-500': row.status === 'Partial',
              'bg-red-500': row.status === 'Offline',
            }"
            :title="row.status"
          ></span>
          <span
            v-if="row.state !== 'available'"
            class="region-tag rounded px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-[0.14em]"
          >
            {{ $t(`match.lifecycle.region_${row.state}`) }}
            <template v-if="row.team"> · T{{ row.team }}</template>
          </span>
        </div>
        <span
          class="truncate font-sans text-sm font-bold uppercase tracking-[0.12em]"
          :class="row.state === 'banned' ? 'line-through opacity-70' : ''"
        >
          {{ row.label }}
        </span>
        <!-- The viewer's own measured ping, only when it exists. -->
        <span
          v-if="row.latency"
          class="font-mono text-[0.6rem] text-muted-foreground"
          data-testid="region-latency"
        >
          {{ $t("match.lifecycle.your_ping", { ms: row.latency }) }}
        </span>
      </component>
    </div>

    <div
      v-if="confirmation"
      class="flex flex-col items-center gap-3 rounded-xl border border-[hsl(var(--destructive)/0.6)] bg-[hsl(var(--destructive)/0.08)] p-4 sm:flex-row sm:justify-between"
      data-testid="region-confirm"
    >
      <span class="text-sm font-semibold" data-testid="region-confirm-question">
        {{ confirmation }}
      </span>
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="submitting"
          data-testid="region-confirm-cancel"
          @click="selected = null"
        >
          <X class="h-4 w-4" />
          {{ $t("common.cancel") }}
        </Button>
        <Button
          size="sm"
          :disabled="submitting"
          data-testid="region-confirm-submit"
          @click="submit"
        >
          <Spinner v-if="submitting" class="h-4 w-4" />
          <Check v-else class="h-4 w-4" />
          {{ $t("match.region_veto.confirm_ban") }}
        </Button>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { e_player_roles_enum, e_veto_pick_types_enum } from "~/generated/zeus";
import { regionVetoPickMutation } from "~/graphql/regionVetoPick";
import { regionVetoStates } from "~/utilities/matchLifecycle";
import { useSound } from "~/composables/useSound";
import { toast } from "@/components/ui/toast";

/**
 * The Overview's region veto: teams take turns banning a region until one is
 * left, which Postgres then locks in (auto_select_region_veto). The ban is
 * the same insert MatchRegionVeto sends (regionVetoPickMutation); the turn
 * comes from the match's computed fields and verify_region_veto_pick stays
 * the authority. Expired turns are auto-banned by the server.
 */
export default {
  props: {
    match: { type: Object, required: true },
    picks: { type: Array, default: () => [] },
  },
  data() {
    return {
      override: false,
      submitting: false,
      selected: null as string | null,
      submitTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
      sounds: useSound(),
    };
  },
  watch: {
    isPicking(isPicking: boolean) {
      this.selected = null;
      if (isPicking) this.sounds.playMatchFoundSound();
    },
    picks(current: any[], previous: any[]) {
      if (previous && current.length > previous.length) {
        this.sounds.playTickSound();
        this.finishSubmitting();
      }
    },
  },
  mounted() {
    if (this.isPicking) this.sounds.playMatchFoundSound();
  },
  beforeUnmount() {
    if (this.submitTimeout) clearTimeout(this.submitTimeout);
  },
  methods: {
    canSelect(row: { state: string }) {
      return this.isPicking && !this.submitting && row.state === "available";
    },
    finishSubmitting() {
      if (this.submitTimeout) {
        clearTimeout(this.submitTimeout);
        this.submitTimeout = undefined;
      }
      this.submitting = false;
      this.selected = null;
    },
    async submit() {
      if (this.submitting || !this.selected || !this.isPicking) return;
      this.submitting = true;
      try {
        await this.$apollo.mutate({
          mutation: regionVetoPickMutation,
          variables: {
            region: this.selected,
            type: e_veto_pick_types_enum.Ban,
            match_id: this.match.id,
            match_lineup_id: this.match.region_veto_picking_lineup_id,
          },
        });
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
    // Same rule as MatchRegionVeto (stricter than the map veto's).
    canOverride() {
      return (
        this.match.is_organizer &&
        useAuthStore().isRoleAbove(e_player_roles_enum.match_organizer)
      );
    },
    isPicking() {
      if (this.canOverride && this.override) return true;
      return !!(
        this.match.lineup_1?.can_pick_region_veto ||
        this.match.lineup_2?.can_pick_region_veto
      );
    },
    rows() {
      const known = useApplicationSettingsStore().availableRegions ?? [];
      const matchmaking = useMatchmakingStore();
      return regionVetoStates(this.match, this.picks as any[]).map((row) => {
        const info = known.find(
          (region: any) => region.value.toLowerCase() === row.value.toLowerCase(),
        );
        const latency = matchmaking.getRegionlatencyResult?.(row.value)?.latency;
        return {
          ...row,
          label: info?.description || row.value,
          status: info?.status ?? "Offline",
          latency: latency ? Math.round(Number(latency)) : null,
        };
      });
    },
    confirmation() {
      if (!this.isPicking || !this.selected) return null;
      const row = this.rows.find((r: any) => r.value === this.selected);
      return row
        ? this.$t("match.lifecycle.confirm_region_question", { region: row.label })
        : null;
    },
  },
};
</script>

<style scoped>
.region-card {
  --tone: var(--border);
  border-color: hsl(var(--tone) / 0.7);
  background: linear-gradient(160deg, hsl(var(--card) / 0.7), hsl(var(--background) / 0.6));
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}
.region-card.is-banned {
  --tone: var(--destructive);
  opacity: 0.45;
}
.region-card.is-selected {
  --tone: 0 0% 92%;
  box-shadow: inset 0 0 0 1px hsl(var(--tone) / 0.6);
}
.region-tag {
  color: hsl(var(--tone));
  background: hsl(var(--tone) / 0.12);
}
.region-card.is-pickable {
  cursor: pointer;
}
.region-card.is-pickable:hover,
.region-card.is-chosen {
  --tone: var(--destructive);
  transform: translateY(-2px);
  box-shadow: 0 0 18px hsl(var(--tone) / 0.3);
}
@media (prefers-reduced-motion: reduce) {
  .region-card {
    transition: none;
  }
}
</style>
