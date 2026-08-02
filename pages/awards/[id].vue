<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, ref } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { validate as validateUuid } from "uuid";
import { ArrowLeft, CalendarDays, Users } from "lucide-vue-next";
import AwardArtwork from "~/components/award/AwardArtwork.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { Skeleton } from "~/components/ui/skeleton";
import Empty from "~/components/ui/empty/Empty.vue";
import EmptyTitle from "~/components/ui/empty/EmptyTitle.vue";
import EmptyDescription from "~/components/ui/empty/EmptyDescription.vue";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import {
  activeAwardHolders,
  awardDefinitionScope,
  awardDetailStats,
  occurrenceContext,
  type ActiveAwardHolder,
  type AwardDetail,
} from "~/utilities/awardDetail";
import { AWARD_TIER_COLORS } from "~/utilities/awardArtwork";

const AWARD_DETAIL_QUERY = gql`
  query PublicAwardDetail($id: uuid!) {
    awards_by_pk(id: $id) {
      id
      name
      description
      tier
      silhouette
      image_url
      system_key
      tournament_id
      event_id
      elo_season_id
      league_season_id
      tournament { id name }
      event { id name }
      elo_season { id number }
      league_season { id name season_number }
      occurrences(order_by: [{ effective_at: desc }, { created_at: desc }]) {
        id
        effective_at
        created_at
        tournament_id
        event_id
        elo_season_id
        league_season_id
        tournament { id name }
        event { id name }
        elo_season { id number }
        league_season { id name season_number }
        recipients(
          where: { revoked_at: { _is_null: true } }
          order_by: { created_at: desc }
        ) {
          id
          player_steam_id
          team_id
          tournament_team_id
          revoked_at
          created_at
          player { steam_id name avatar_url }
          team { id name short_name avatar_url }
          tournament_team {
            id
            name
            team_id
            team { id name short_name avatar_url }
          }
        }
      }
    }
  }
`;

const route = useRoute();
const { resolveClient } = useApolloClient();
const award = ref<AwardDetail | null>(null);
const loading = ref(true);
const initialLoadComplete = ref(false);
const error = ref<Error | null>(null);

const holders = computed(() =>
  award.value ? activeAwardHolders(award.value) : [],
);
const stats = computed(() =>
  award.value
    ? awardDetailStats(award.value)
    : {
        totalActiveGrants: 0,
        uniqueActiveHolders: 0,
        firstGrantAt: null,
        latestGrantAt: null,
      },
);
const detailContentReady = computed(
  () => initialLoadComplete.value && !!award.value,
);
const scopeLabel = computed(() =>
  award.value ? awardDefinitionScope(award.value) : "",
);
const apiDomain = computed(() => useRuntimeConfig().public.apiDomain as string);

const tierColors = AWARD_TIER_COLORS;
const accent = computed(
  () => tierColors[award.value?.tier || "special"] || tierColors.special,
);

useHead({ title: computed(() => award.value?.name || "Award") });

function holderTeam(holder: ActiveAwardHolder) {
  return (
    holder.recipient.team ||
    holder.recipient.tournament_team?.team || {
      id:
        holder.recipient.team_id ||
        holder.recipient.tournament_team?.team_id ||
        holder.recipient.tournament_team_id,
      name: holder.recipient.tournament_team?.name || "Team",
    }
  );
}

function teamAvatar(holder: ActiveAwardHolder) {
  return resolveAvatarUrl(holderTeam(holder)?.avatar_url, apiDomain.value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatYear(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : String(date.getFullYear());
}

async function loadAward() {
  loading.value = true;
  error.value = null;
  const id = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;
  if (typeof id !== "string" || !validateUuid(id)) {
    award.value = null;
    loading.value = false;
    initialLoadComplete.value = true;
    return;
  }

  try {
    const result = await resolveClient().query<{ awards_by_pk: AwardDetail | null }>({
      query: AWARD_DETAIL_QUERY,
      variables: { id },
      fetchPolicy: "network-only",
    });
    award.value = result.data.awards_by_pk;
  } catch (caught) {
    error.value = caught instanceof Error ? caught : new Error(String(caught));
  } finally {
    loading.value = false;
    if (!initialLoadComplete.value) {
      initialLoadComplete.value = true;
    }
  }
}

onMounted(loadAward);
</script>

<template>
  <main class="space-y-5 py-6">
    <PageTransition :show="initialLoadComplete">
      <div class="space-y-5">
      <NuxtLink
        to="/awards"
        class="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        Back to Awards
      </NuxtLink>

      <Empty
        v-if="!loading && error"
        class="min-h-52 border border-dashed border-destructive/50"
        role="alert"
      >
        <EmptyTitle>Could not load award</EmptyTitle>
        <EmptyDescription>Please try again in a moment.</EmptyDescription>
        <button
          type="button"
          class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="loadAward"
        >
          Try again
        </button>
      </Empty>

      <Empty
        v-else-if="!loading && !award"
        class="min-h-52 border border-dashed border-border"
      >
        <EmptyTitle>Award not found</EmptyTitle>
        <EmptyDescription>This award does not exist or is no longer available.</EmptyDescription>
      </Empty>

      <template v-else-if="!loading && award">
        <header
          class="relative overflow-hidden rounded-lg border border-border px-5 py-5 sm:px-7 sm:py-6 [background:linear-gradient(180deg,hsl(var(--card)/0.82)_0%,hsl(var(--card)/0.6)_100%)] [backdrop-filter:blur(10px)] before:pointer-events-none before:absolute before:left-2 before:top-2 before:h-[14px] before:w-[14px] before:border-l-2 before:border-t-2 before:border-[hsl(var(--tac-amber))] before:content-[''] after:pointer-events-none after:absolute after:bottom-2 after:right-2 after:h-[14px] after:w-[14px] after:border-b-2 after:border-r-2 after:border-[hsl(var(--tac-amber))] after:content-['']"
        >
          <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div class="relative flex h-40 w-40 shrink-0 items-center justify-center self-center sm:self-auto">
              <div
                class="pointer-events-none absolute inset-3 rounded-full blur-3xl"
                :style="{ background: accent, opacity: 0.25 }"
                aria-hidden="true"
              ></div>
              <AwardArtwork
                :award="award"
                size="hero"
                class="relative drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)]"
              />
            </div>

            <div class="relative min-w-0 flex-1">
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <span
                  class="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em]"
                  :style="{ color: accent }"
                >{{ award.tier }}</span>
                <span class="rounded-sm border border-border/80 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.15em] text-muted-foreground">
                  {{ scopeLabel }}
                </span>
                <span class="rounded-sm border border-border/80 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.15em] text-muted-foreground">
                  {{ award.system_key ? "Built-in" : "Custom" }}
                </span>
              </div>
              <h1 class="m-0 font-sans text-[clamp(1.75rem,5vw,3rem)] font-bold uppercase leading-[0.95] tracking-[0.02em]">
                {{ award.name }}
              </h1>
              <p v-if="award.description" class="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {{ award.description }}
              </p>
            </div>
          </div>
        </header>
      </template>

      </div>
    </PageTransition>

    <div v-if="loading" aria-busy="true" aria-label="Loading award">
      <Skeleton class="h-56 w-full rounded-lg" />
      <Skeleton class="mt-5 h-20 w-full rounded-lg" aria-hidden="true" />
      <Skeleton class="mt-5 h-64 w-full rounded-lg" aria-hidden="true" />
    </div>

    <PageTransition :delay="100" :show="detailContentReady">
      <dl v-if="award" class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-4">
          <div class="bg-background/70 p-3">
            <dt class="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">Active grants</dt>
            <dd class="mt-1 font-mono text-lg font-bold tabular-nums" :style="{ color: accent }">{{ stats.totalActiveGrants }}</dd>
          </div>
          <div class="bg-background/70 p-3">
            <dt class="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">Unique holders</dt>
            <dd class="mt-1 font-mono text-lg font-bold tabular-nums">{{ stats.uniqueActiveHolders }}</dd>
          </div>
          <div class="bg-background/70 p-3">
            <dt class="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">First granted</dt>
            <dd class="mt-1 text-sm font-semibold">{{ formatDate(stats.firstGrantAt) }}</dd>
          </div>
          <div class="bg-background/70 p-3">
            <dt class="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">Latest grant</dt>
            <dd class="mt-1 text-sm font-semibold">{{ formatDate(stats.latestGrantAt) }}</dd>
          </div>
      </dl>
    </PageTransition>

    <PageTransition :delay="175" :show="detailContentReady">
      <div v-if="award">
        <section class="space-y-3" aria-labelledby="holder-history-heading">
          <div class="flex items-center gap-2">
            <Users class="h-4 w-4 text-[hsl(var(--tac-amber))]" aria-hidden="true" />
            <h2 id="holder-history-heading" class="font-mono text-xs font-semibold uppercase tracking-[0.18em]">
              Holder history
            </h2>
            <span class="h-px flex-1 bg-border/60"></span>
            <span class="font-mono text-xs text-muted-foreground">{{ holders.length }}</span>
          </div>

          <Empty v-if="!holders.length" class="min-h-44 border border-dashed border-border">
            <EmptyTitle>No holders yet</EmptyTitle>
            <EmptyDescription>This award has not been granted to anyone yet.</EmptyDescription>
          </Empty>

          <TransitionGroup
            v-else
            tag="ol"
            name="holder"
            class="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card/30"
          >
            <li
              v-for="holder in holders"
              :key="holder.recipient.id"
              class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <div class="min-w-0 flex-1 basis-56">
                <PlayerDisplay
                  v-if="holder.kind === 'player'"
                  :player="holder.recipient.player || { steam_id: holder.recipient.player_steam_id, name: 'Player' }"
                  linkable
                  size="xs"
                  compact
                  truncate-name
                  :show-elo="false"
                  :show-role="false"
                  :show-flag="false"
                  :show-online="false"
                  :tooltip="false"
                />
                <NuxtLink
                  v-else
                  :to="holderTeam(holder)?.id ? `/teams/${holderTeam(holder).id}` : undefined"
                  class="group/team flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar shape="square" class="h-8 w-8 shrink-0">
                    <AvatarImage
                      v-if="teamAvatar(holder)"
                      :src="teamAvatar(holder)!"
                      :alt="holderTeam(holder)?.name || 'Team'"
                    />
                    <AvatarFallback>{{ (holderTeam(holder)?.short_name || holderTeam(holder)?.name || "TM").slice(0, 2) }}</AvatarFallback>
                  </Avatar>
                  <span class="truncate text-sm font-semibold group-hover/team:text-[hsl(var(--tac-amber))]">
                    {{ holderTeam(holder)?.name || "Team" }}
                  </span>
                </NuxtLink>
              </div>

              <div class="min-w-0 basis-48">
                <NuxtLink
                  v-if="occurrenceContext(holder.occurrence).to"
                  :to="occurrenceContext(holder.occurrence).to!"
                  class="block truncate rounded-sm text-sm font-medium hover:text-[hsl(var(--tac-amber))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {{ occurrenceContext(holder.occurrence).label }}
                </NuxtLink>
                <span v-else class="block truncate text-sm font-medium">{{ occurrenceContext(holder.occurrence).label }}</span>
                <span class="mt-0.5 flex items-center gap-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                  <CalendarDays class="h-3 w-3" aria-hidden="true" />
                  {{ formatYear(holder.chronologyAt) || "Year unavailable" }}
                </span>
              </div>

              <div class="ml-auto text-right">
                <time :datetime="holder.chronologyAt" class="font-mono text-xs text-muted-foreground">
                  {{ formatDate(holder.chronologyAt) }}
                </time>
                <p v-if="holder.recipient.awarded_by?.name" class="mt-0.5 text-xs text-muted-foreground">
                  Awarded by {{ holder.recipient.awarded_by.name }}
                </p>
              </div>
            </li>
          </TransitionGroup>
        </section>
      </div>
    </PageTransition>
  </main>
</template>

<style scoped>
.holder-move,
.holder-enter-active,
.holder-leave-active {
  transition: transform 220ms ease, opacity 180ms ease;
}
.holder-enter-from,
.holder-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
  .holder-move,
  .holder-enter-active,
  .holder-leave-active {
    transition: none;
  }
}
</style>
