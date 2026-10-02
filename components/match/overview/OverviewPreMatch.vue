<script lang="ts" setup>
import MatchInfo from "~/components/match/MatchInfo.vue";
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

    <!-- The Scoreboard's own server panel (MatchInfo / QuickMatchConnect):
         Server Booting until the server is up, then Time to Connect and
         Copy IP / Join Server in the same place. Hasura supplies no
         connection fields to viewers who may not see them. -->
    <div
      class="min-w-0 w-full"
      data-testid="pre-match-connect"
      :data-state="serverState"
    >
      <MatchInfo :match="match" connect-only lifecycle />
    </div>
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
      // Veto picks and match_maps arrive on separate subscriptions. Keep a
      // known final map visible while the match_maps snapshot catches up.
      const selectedMaps = (this.picks as any[]).filter(
        (pick) => pick.type === "Pick" || pick.type === "Decider",
      );
      return Array.from({ length: count }, (_, index) => {
        const matchMap = maps[index] ?? null;
        const map = matchMap?.map ?? selectedMaps[index]?.map ?? null;
        return {
          key: matchMap?.id ?? `slot-${index}`,
          number: index + 1,
          map,
          decider: this.deciderMapIds.has(map?.id),
          ctTeam: matchMap ? ctStartTeam(matchMap) : null,
        };
      });
    },
    // Not shown as its own bar (the panel itself says Server Booting); kept
    // as a data attribute for the page and tests.
    serverState() {
      return this.match.status === "Live" && this.match.is_server_online
        ? "ready"
        : "booting";
    },
  },
};
</script>
