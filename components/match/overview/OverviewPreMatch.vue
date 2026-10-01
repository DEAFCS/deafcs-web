<script lang="ts" setup>
import { Spinner } from "~/components/ui/spinner";
import QuickMatchConnect from "~/components/match/QuickMatchConnect.vue";
import mapLabel from "~/utilities/mapLabel";
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="overview-pre-match">
    <ol class="flex flex-col gap-2" data-testid="pre-match-maps">
      <li
        v-for="slot in slots"
        :key="slot.key"
        class="relative overflow-hidden rounded-xl border border-border/70"
        :data-testid="`pre-match-map-${slot.number}`"
      >
        <img
          v-if="slot.map?.poster"
          :src="slot.map.poster"
          alt=""
          class="absolute inset-0 h-full w-full object-cover brightness-[0.4]"
        />
        <div class="relative flex items-center justify-between gap-3 px-4 py-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <span
              class="font-mono text-[0.6rem] font-bold uppercase tracking-[0.22em] text-[hsl(var(--tac-amber))]"
            >
              {{ $t("match.map_number", { count: slot.number }) }}
            </span>
            <span class="truncate font-sans text-lg font-bold uppercase tracking-[0.12em] text-white">
              {{ slot.map ? mapLabel(slot.map) : $t("match.map_tbd") }}
            </span>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1 text-right">
            <span
              v-if="slot.decider"
              class="rounded border border-white/40 bg-black/50 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white"
              data-testid="pre-match-decider"
            >
              {{ $t("match.lifecycle.map_decider") }}
            </span>
            <span
              v-if="slot.ctTeam"
              class="text-xs font-semibold"
              :class="slot.ctTeam === 1 ? 'text-[hsl(var(--tac-amber))]' : 'text-[hsl(200_90%_62%)]'"
              data-testid="pre-match-side"
            >
              {{ $t("match.lifecycle.starts_ct", { team: teamName(slot.ctTeam) }) }}
            </span>
          </div>
        </div>
      </li>
    </ol>

    <div
      class="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm"
      data-testid="pre-match-server"
      :data-state="serverState"
    >
      <Spinner v-if="serverState !== 'ready'" class="h-4 w-4 shrink-0" />
      <span v-else class="h-2 w-2 shrink-0 rounded-full bg-green-500"></span>
      <span>{{ $t(`match.lifecycle.server_${serverState}`) }}</span>
    </div>

    <!-- The match page's own connect panel: renders nothing for guests or
         before Live, and Hasura already returns no connection fields to
         viewers who may not see them. Join Server and Copy IP come from it. -->
    <QuickMatchConnect :match="match" hide-booting />
  </section>
</template>

<script lang="ts">
import { ctStartTeam } from "~/utilities/matchLifecycle";

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
  },
  methods: {
    teamName(team: 1 | 2) {
      const lineup = this.match[`lineup_${team}`];
      return lineup?.name || this.$t(`match.lineup.lineup_${team}`);
    },
  },
  computed: {
    deciderMapIds() {
      return new Set(
        (this.picks as any[])
          .filter((pick) => pick.type === "Decider")
          .map((pick) => pick.map?.id),
      );
    },
    // One row per map the format plays, filled as match_maps exist.
    slots() {
      const maps = [...(this.match.match_maps ?? [])].sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
      );
      const count = Math.max(this.match.options?.best_of ?? 0, maps.length);
      return Array.from({ length: count }, (_, index) => {
        const matchMap = maps[index] ?? null;
        return {
          key: matchMap?.id ?? `slot-${index}`,
          number: index + 1,
          map: matchMap?.map ?? null,
          decider: !!matchMap && this.deciderMapIds.has(matchMap.map?.id),
          ctTeam: matchMap ? ctStartTeam(matchMap) : null,
        };
      });
    },
    serverState() {
      if (this.match.status !== "Live") return "waiting";
      return this.match.is_server_online ? "ready" : "starting";
    },
  },
};
</script>
