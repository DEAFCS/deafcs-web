<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, ref } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { Award, Search, Trophy } from "lucide-vue-next";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import AnimatedFilters from "~/components/common/AnimatedFilters.vue";
import { Skeleton } from "~/components/ui/skeleton";
import Empty from "~/components/ui/empty/Empty.vue";
import EmptyTitle from "~/components/ui/empty/EmptyTitle.vue";
import EmptyDescription from "~/components/ui/empty/EmptyDescription.vue";
import {
  activeGrantCount,
  filterAwards,
  groupAwards,
  type AwardCatalogAward,
  type AwardScopeKind,
} from "~/utilities/awardCatalog";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

useHead({ title: "Awards" });

const AWARDS_QUERY = gql`
  query PublicAwardCatalog {
    awards(
      where: { archived_at: { _is_null: true } }
      order_by: { name: asc }
    ) {
      id
      name
      description
      tier
      image_url
      archived_at
      tournament_id
      event_id
      elo_season_id
      league_season_id
      tournament { id name }
      event { id name }
      elo_season { id number }
      league_season { id name season_number }
      occurrences {
        recipients_aggregate(where: { revoked_at: { _is_null: true } }) {
          aggregate { count }
        }
      }
    }
  }
`;

const { resolveClient } = useApolloClient();
const awards = ref<AwardCatalogAward[]>([]);
const loading = ref(true);
const error = ref<Error | null>(null);
const search = ref("");
const tier = ref("all");

const tierOptions = computed(() => {
  const options = ["mvp", "gold", "silver", "bronze", "special"];
  return [
    { key: "all", label: "All", count: awards.value.length },
    ...options.map((key) => ({
      key,
      label: key === "mvp" ? "MVP" : key.charAt(0).toUpperCase() + key.slice(1),
      count: awards.value.filter((award) => award.tier === key).length,
    })),
  ];
});

const visibleAwards = computed(() =>
  filterAwards(awards.value, search.value, tier.value),
);
const groups = computed(() => groupAwards(visibleAwards.value));
const apiDomain = computed(() => useRuntimeConfig().public.apiDomain);

const scopeLabels: Record<AwardScopeKind, string> = {
  global: "Global",
  tournament: "Tournament",
  event: "Event",
  elo_season: "ELO season",
  league_season: "League season",
};
const tierColors: Record<string, string> = {
  mvp: "hsl(195 85% 60%)",
  gold: "hsl(45 95% 60%)",
  silver: "hsl(0 0% 78%)",
  bronze: "hsl(28 70% 52%)",
  special: "hsl(258 90% 74%)",
};

function imageUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const filename = path.replace(/^(awards|trophies)\//, "");
  return `https://${apiDomain.value}/avatars/awards/${filename}`;
}

function awardHref(id: string) {
  return `/awards/${encodeURIComponent(id)}`;
}

function openAward(id: string) {
  return navigateTo(awardHref(id));
}

async function loadAwards() {
  loading.value = true;
  error.value = null;
  try {
    const client = resolveClient();
    const result = await client.query<{ awards: AwardCatalogAward[] }>({
      query: AWARDS_QUERY,
      fetchPolicy: "cache-first",
    });
    awards.value = result.data.awards || [];
  } catch (caught) {
    error.value = caught instanceof Error ? caught : new Error(String(caught));
  } finally {
    loading.value = false;
  }
}

onMounted(loadAwards);
</script>

<template>
  <PageTransition :delay="0">
    <div class="container mx-auto max-w-6xl space-y-5 py-6">
      <TacticalPageHeader>
        <template #title>Awards</template>
        <template #subtitle>
          Browse the awards earned by players and teams across DEAFCS.
        </template>
      </TacticalPageHeader>

      <section class="space-y-4" aria-labelledby="award-catalog-heading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="award-catalog-heading"
            :class="[tacticalSectionLabelClasses, 'mb-0']"
          >
            <span :class="tacticalSectionTickClasses"></span>
            Award catalog
            <span
              v-if="awards.length"
              class="rounded-sm border border-[hsl(var(--tac-amber)/0.35)] bg-[hsl(var(--tac-amber)/0.12)] px-1.5 py-0.5 text-[0.62rem] text-[hsl(var(--tac-amber))]"
            >
              {{ visibleAwards.length }}/{{ awards.length }}
            </span>
          </h2>

          <label class="relative block">
            <span class="sr-only">Search awards</span>
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              v-model="search"
              type="search"
              placeholder="Search awards"
              class="h-9 w-64 rounded-md border border-border bg-muted/30 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        <AnimatedFilters v-model="tier" square :options="tierOptions" />

        <div
          v-if="loading"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-label="Loading awards"
          aria-busy="true"
        >
          <Skeleton v-for="index in 8" :key="index" class="h-72 rounded-lg" />
        </div>

        <Empty
          v-else-if="error"
          class="min-h-52 border border-dashed border-destructive/50"
          role="alert"
        >
          <EmptyTitle>Could not load awards</EmptyTitle>
          <EmptyDescription>Please try again in a moment.</EmptyDescription>
          <button
            type="button"
            class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="loadAwards"
          >
            Try again
          </button>
        </Empty>

        <Empty
          v-else-if="!awards.length"
          class="min-h-52 border border-dashed border-border"
        >
          <EmptyTitle>No awards yet</EmptyTitle>
          <EmptyDescription>
            Award definitions will appear here when they become available.
          </EmptyDescription>
        </Empty>

        <Empty
          v-else-if="!groups.length"
          class="min-h-52 border border-dashed border-border"
        >
          <EmptyTitle>No matching awards</EmptyTitle>
          <EmptyDescription>Try another search or tier filter.</EmptyDescription>
        </Empty>

        <div v-else class="space-y-7">
          <section v-for="group in groups" :key="`${group.kind}:${group.ownerKey}`">
            <div class="mb-3 flex items-center gap-2">
              <h3 class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {{ scopeLabels[group.kind] }}
                <span v-if="group.ownerName" class="text-foreground">/ {{ group.ownerName }}</span>
              </h3>
              <span class="h-px flex-1 bg-border/60"></span>
              <span class="font-mono text-xs text-muted-foreground">{{ group.awards.length }}</span>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <a
                v-for="award in group.awards"
                :key="award.id"
                :href="awardHref(award.id)"
                class="group relative flex min-h-72 cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card/55 p-4 transition-[border-color,transform,background-color] hover:-translate-y-0.5 hover:border-[hsl(var(--tac-amber)/0.55)] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none"
                :aria-label="`${award.name}, ${award.tier} award, ${activeGrantCount(award)} active grants`"
                @keydown.space.prevent="openAward(award.id)"
              >
                <div class="relative mb-4 flex h-36 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background/45">
                  <div
                    class="pointer-events-none absolute inset-x-8 bottom-0 h-20 blur-2xl"
                    :style="{ background: tierColors[award.tier] || tierColors.special, opacity: 0.25 }"
                  ></div>
                  <img
                    v-if="imageUrl(award.image_url)"
                    :src="imageUrl(award.image_url)!"
                    :alt="`${award.name} award`"
                    class="relative h-28 w-28 object-contain"
                    loading="lazy"
                  />
                  <Trophy
                    v-else
                    class="relative h-20 w-20"
                    :style="{ color: tierColors[award.tier] || tierColors.special }"
                    aria-hidden="true"
                  />
                </div>

                <div class="mb-2 flex items-center justify-between gap-2">
                  <span
                    class="inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.18em]"
                    :style="{ color: tierColors[award.tier] || tierColors.special }"
                  >
                    <Award class="h-3.5 w-3.5" aria-hidden="true" />
                    {{ award.tier }}
                  </span>
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                    {{ activeGrantCount(award) }} grants
                  </span>
                </div>
                <h4 class="text-lg font-bold uppercase tracking-[0.03em] group-hover:text-[hsl(var(--tac-amber))]">
                  {{ award.name }}
                </h4>
                <p class="mt-1 line-clamp-3 text-sm text-muted-foreground">
                  {{ award.description || "No description provided." }}
                </p>
              </a>
            </div>
          </section>
        </div>
      </section>
    </div>
  </PageTransition>
</template>
