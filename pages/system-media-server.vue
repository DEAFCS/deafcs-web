<script setup lang="ts">
import { generateQuery } from "~/graphql/graphqlGen";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import CpuChart from "~/components/charts/CpuChart.vue";
import MemoryChart from "~/components/charts/MemoryChart.vue";
</script>

<template>
  <div class="relative space-y-8 [--tac-clip:14px] [--tac-clip-sm:10px]">
    <PageTransition :delay="0">
      <section class="space-y-4">
        <header class="border-b border-border/60 pb-3">
          <div class="flex items-center gap-3">
            <span class="inline-block h-[2px] w-[14px] bg-[hsl(var(--tac-amber))]" />
            <h2 class="font-sans text-lg font-bold uppercase tracking-[0.08em]">
              {{ $t("pages.system_media_server.title") }}
            </h2>
          </div>
          <p class="mt-2 max-w-3xl text-sm text-muted-foreground">
            {{ $t("pages.system_media_server.description") }}
          </p>
        </header>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="border border-border bg-background/40 p-4">
            <div class="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              {{ $t("pages.system_media_server.publishing") }}
            </div>
            <div class="mt-2 text-3xl font-bold tabular-nums">
              {{ getMediaServerStats?.publishing ?? 0 }}
            </div>
          </div>
          <div class="border border-border bg-background/40 p-4">
            <div class="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              {{ $t("pages.system_media_server.paths") }}
            </div>
            <div class="mt-2 text-3xl font-bold tabular-nums">
              {{ getMediaServerStats?.paths ?? 0 }}
            </div>
          </div>
          <div class="border border-border bg-background/40 p-4">
            <div class="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              {{ $t("pages.system_media_server.webrtc_sessions") }}
            </div>
            <div class="mt-2 text-3xl font-bold tabular-nums">
              {{ getMediaServerStats?.webrtcSessions ?? 0 }}
            </div>
          </div>
        </div>

        <p class="max-w-3xl text-xs text-muted-foreground">
          {{ $t("pages.system_media_server.path_description") }}
        </p>

        <p
          v-if="getMediaServerStats && getMediaServerStats.publishing === 0"
          class="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted-foreground"
        >
          {{ $t("pages.system_media_server.nothing_publishing") }}
        </p>
      </section>
    </PageTransition>

    <PageTransition :delay="40">
      <section class="space-y-4">
        <header class="border-b border-border/60 pb-3">
          <h2 class="font-sans text-lg font-bold uppercase tracking-[0.08em]">
            {{ $t("pages.system_media_server.resource_usage") }}
          </h2>
        </header>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="border border-border bg-background/40 p-4">
            <div class="mb-2 flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              <Cpu class="h-3.5 w-3.5" />
              {{ $t("pages.system_media_server.cpu_usage") }}
            </div>
            <!-- CpuChart/MemoryChart compute their y-axis max once, in
                 data(), from whatever `metrics` holds at mount time --
                 not reactively. Mounting before the first poll resolves
                 (history still empty) freezes MemoryChart's computed
                 max at Math.max() with no args (-Infinity), which
                 renders as a blank chart. CpuChart never hits this
                 since its max is a hardcoded 100. Simplest fix without
                 touching the shared chart components (also used by
                 system-metrics.vue): don't mount either chart until
                 there's at least one real data point to compute from. -->
            <div class="h-[180px]">
              <CpuChart v-if="cpuHistory.length > 0" :metrics="cpuHistory" />
              <div
                v-else
                class="flex h-full items-center justify-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
              >
                {{ $t("common.loading") }}
              </div>
            </div>
          </div>
          <div class="border border-border bg-background/40 p-4">
            <div class="mb-2 flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              <HardDrive class="h-3.5 w-3.5" />
              {{ $t("pages.system_media_server.memory_usage") }}
            </div>
            <div class="h-[180px]">
              <MemoryChart v-if="memoryHistory.length > 0" :metrics="memoryHistory" label="GB" />
              <div
                v-else
                class="flex h-full items-center justify-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
              >
                {{ $t("common.loading") }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageTransition>
  </div>
</template>

<script lang="ts">
import { Cpu, HardDrive } from "lucide-vue-next";

// CpuChart/MemoryChart (also used on system-metrics.vue) plot a
// {time, used, total} history, but getMediaServerStats only ever
// returns a live snapshot -- there's no server-side history for a
// single pod's usage the way there is for tracked game-node services.
// Built here instead: each 5s poll appends one point (used = current
// reading, total = the pod's actual resource *limit*, so the chart's
// percentage axis means something real -- "how much of what this pod
// is allowed to use" -- not a fabricated scale).
const MAX_HISTORY_POINTS = 60; // 5 minutes at a 5s poll interval

export default {
  components: { Cpu, HardDrive },
  data() {
    return {
      cpuHistory: [] as Array<{ time: Date; used: number; total: number }>,
      memoryHistory: [] as Array<{ time: Date; used: number; total: number }>,
    };
  },
  apollo: {
    getMediaServerStats: {
      query: generateQuery({
        getMediaServerStats: [
          {},
          {
            publishing: true,
            paths: true,
            webrtcSessions: true,
            cpuMilliCores: true,
            memoryBytes: true,
            cpuLimitMilliCores: true,
            memoryLimitBytes: true,
          },
        ],
      }),
      pollInterval: 5 * 1000,
    },
  },
  watch: {
    getMediaServerStats: {
      handler(stats) {
        if (!stats) return;
        const time = new Date();

        // CpuChart expects `used` in nanocores and `total` as a raw
        // CPU-count (eg. 0.5 for a 500m limit), matching how it already
        // reads game-node pod stats.
        this.cpuHistory = [
          ...this.cpuHistory,
          {
            time,
            used: Number(stats.cpuMilliCores || 0) * 1_000_000,
            total: Math.max(Number(stats.cpuLimitMilliCores || 0) / 1000, 0.001),
          },
        ].slice(-MAX_HISTORY_POINTS);

        this.memoryHistory = [
          ...this.memoryHistory,
          {
            time,
            used: Number(stats.memoryBytes || 0),
            total: Math.max(Number(stats.memoryLimitBytes || 0), 1),
          },
        ].slice(-MAX_HISTORY_POINTS);
      },
      immediate: true,
    },
  },
};
</script>
