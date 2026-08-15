<script setup lang="ts">
import { generateQuery } from "~/graphql/graphqlGen";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { formatBytes } from "~/utilities/formatResourceUsage";
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

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="border border-border bg-background/40 p-4">
            <div class="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              {{ $t("pages.system_media_server.cpu_usage") }}
            </div>
            <div class="mt-2 text-2xl font-bold tabular-nums">
              {{ Math.round(getMediaServerStats?.cpuMilliCores ?? 0) }}m
              <span class="text-sm font-normal text-muted-foreground">cores</span>
            </div>
          </div>
          <div class="border border-border bg-background/40 p-4">
            <div class="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
              {{ $t("pages.system_media_server.memory_usage") }}
            </div>
            <div class="mt-2 text-2xl font-bold tabular-nums">
              {{ formatBytes(getMediaServerStats?.memoryBytes ?? 0) }}
            </div>
          </div>
        </div>
      </section>
    </PageTransition>
  </div>
</template>

<script lang="ts">
export default {
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
          },
        ],
      }),
      pollInterval: 5 * 1000,
    },
  },
};
</script>
