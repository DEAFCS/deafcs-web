<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, CalendarClock, CheckCircle2, Swords, Trophy, UserCheck } from "lucide-vue-next";
import { $, e_tournament_status_enum, order_by } from "~/generated/zeus";
import { generateQuery, generateSubscription } from "~/graphql/graphqlGen";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { NOT_LEAGUE_TOURNAMENT } from "~/graphql/tournamentFilters";
import { formatStartTime } from "~/components/watch/watchTicker";
import { relativeWhen } from "~/components/play/scheduleRow";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import { checkInText, homeCheckIn } from "~/components/home/dashboard/homeTournamentCheckIn";
import {
  ACTIVE_MATCH_STATUSES,
  homePanelClasses,
  homePanelPaddingClasses,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

// "Your Tournament": the tournaments this player is registered or signed up
// for that have not finished. Time, check-in and the next opponent come from
// the tournament itself; a next match that already exists as a match is
// listed in "Your Scheduled Matches" instead, so it is only named here.
const props = defineProps<{ viewer: HomeViewer }>();

const { t } = useI18n();
const tournaments = ref<any[]>([]);
const nextBrackets = ref<Record<string, any>>({});
const sample = ref(false);

const tournamentsQuery = generateSubscription({
  tournaments: [
    {
      where: {
        status: { _nin: $("statuses", "[e_tournament_status_enum!]") },
        _or: [
          { rosters: { player_steam_id: { _eq: $("steam_id", "bigint!") } } },
          {
            individual_signups: {
              player_steam_id: { _eq: $("steam_id", "bigint!") },
              status: { _neq: "Removed" },
            },
          },
          {
            free_agents: {
              player_steam_id: { _eq: $("steam_id", "bigint!") },
              status: { _neq: "withdrawn" },
            },
          },
        ],
        _and: [NOT_LEAGUE_TOURNAMENT],
      },
      order_by: [{ start: order_by.asc }],
      limit: 2,
    },
    {
      id: true,
      name: true,
      start: true,
      status: true,
      e_tournament_status: { description: true },
      // The same check-in fields TournamentDetail hands TournamentCheckInPanel.
      registration_version: true,
      check_in_required: true,
      check_in_setting: true,
      check_in_opens_before_minutes: true,
      check_in_closes_before_minutes: true,
      check_in_ends_at: true,
      check_in_started: true,
      min_players_per_lineup: true,
      is_organizer: true,
      // Legacy individual sign-ups have their own window (the layout's
      // TournamentCheckInOverlay); version 2 uses the fields above.
      individual_check_in_ends_at: true,
      current_stage: true,
      options: { type: true },
      teams_aggregate: [{}, { aggregate: { count: true } }],
      stages: [
        { order_by: [{ order: order_by.asc }] },
        { order: true, e_tournament_stage_type: { description: true } },
      ],
      rosters: [
        { where: { player_steam_id: { _eq: $("steam_id", "bigint!") } } },
        {
          checked_in_at: true,
          tournament_team: {
            id: true,
            name: true,
            // tournament_teams.checked_in_at is the one team check-in signal
            // (graphql/tournamentTeamFields.ts); can_manage is who may act in
            // Captains mode; roster stamps only matter in Players mode.
            checked_in_at: true,
            can_manage: true,
            roster: [{}, { player_steam_id: true, checked_in_at: true }],
            results: { wins: true, losses: true, matches_remaining: true },
          },
        },
      ],
      individual_signups: [
        { where: { player_steam_id: { _eq: $("steam_id", "bigint!") } } },
        { status: true, checked_in_at: true },
      ],
      free_agents: [
        {
          where: {
            player_steam_id: { _eq: $("steam_id", "bigint!") },
            status: { _neq: "withdrawn" },
          },
        },
        { status: true, checked_in_at: true, tournament_team_id: true },
      ],
    },
  ],
} as any);

const bracketsQuery = generateQuery({
  tournament_brackets: [
    {
      where: {
        finished: { _eq: false },
        _or: [
          { tournament_team_id_1: { _in: $("team_ids", "[uuid!]!") } },
          { tournament_team_id_2: { _in: $("team_ids", "[uuid!]!") } },
        ],
      },
      order_by: [{ stage: { order: order_by.asc } }, { round: order_by.asc }],
    },
    {
      id: true,
      round: true,
      scheduled_at: true,
      scheduled_eta: true,
      match_id: true,
      match: { status: true },
      tournament_team_id_1: true,
      tournament_team_id_2: true,
      team_1: { id: true, name: true },
      team_2: { id: true, name: true },
    },
  ],
} as any);

let subscription: { unsubscribe: () => void } | undefined;

async function loadNextBrackets(list: any[]) {
  const teamIds = list
    .map((tournament) => tournament.rosters?.[0]?.tournament_team?.id)
    .filter(Boolean);
  if (!teamIds.length) {
    nextBrackets.value = {};
    return;
  }
  try {
    const { data } = await getGraphqlClient().query({
      query: bracketsQuery,
      variables: { team_ids: teamIds },
      fetchPolicy: "network-only",
    });
    const next: Record<string, any> = {};
    for (const bracket of (data as any)?.tournament_brackets ?? []) {
      for (const teamId of [bracket.tournament_team_id_1, bracket.tournament_team_id_2]) {
        if (teamId && teamIds.includes(teamId) && !next[teamId]) next[teamId] = bracket;
      }
    }
    nextBrackets.value = next;
  } catch (error) {
    console.error("[home] next tournament match:", error);
  }
}

async function useSamplesIfEmpty() {
  if (!import.meta.dev || !props.viewer.samples || tournaments.value.length) return;
  const { sampleTournament } = await import(
    "~/components/home/dashboard/homePreviewSamples"
  );
  const { tournament, bracket } = sampleTournament();
  tournaments.value = [tournament];
  nextBrackets.value = { [tournament.rosters[0].tournament_team.id]: bracket };
  sample.value = true;
}

watch(
  () => props.viewer.steamId,
  (steamId) => {
    subscription?.unsubscribe();
    subscription = undefined;
    tournaments.value = [];
    sample.value = false;
    if (!steamId || typeof window === "undefined") return;
    subscription = getGraphqlClient()
      .subscribe({
        query: tournamentsQuery,
        variables: {
          steam_id: steamId,
          statuses: [
            e_tournament_status_enum.Cancelled,
            e_tournament_status_enum.CancelledMinTeams,
            e_tournament_status_enum.Finished,
          ],
        },
      })
      .subscribe({
        next: ({ data }: any) => {
          tournaments.value = data?.tournaments ?? [];
          sample.value = false;
          void loadNextBrackets(tournaments.value);
          void useSamplesIfEmpty();
        },
        error: (error: any) => {
          console.error("[home] your tournament subscription:", error);
          void useSamplesIfEmpty();
        },
      });
  },
  { immediate: true },
);

const now = ref(new Date());
const clock =
  typeof window !== "undefined" ? setInterval(() => (now.value = new Date()), 30_000) : null;
onBeforeUnmount(() => {
  subscription?.unsubscribe();
  if (clock) clearInterval(clock);
});

type Tone = "hot" | "live" | "ok" | "muted";
type Line = { key: string; label: string; value: string; tone: Tone; icon: any };

function statusTone(status: string): Tone {
  if (status === "Live") return "live";
  if (status === "RegistrationOpen") return "hot";
  return "muted";
}

function cardModel(tournament: any) {
  const roster = tournament.rosters?.[0] ?? null;
  const signup = tournament.individual_signups?.[0] ?? null;
  const freeAgent = tournament.free_agents?.[0] ?? null;
  const team = roster?.tournament_team ?? null;
  const live = tournament.status === "Live" || tournament.status === "Paused";
  const start = tournament.start ? new Date(tournament.start) : null;
  const lines: Line[] = [];
  let action: { label: string; to: string } | null = null;

  lines.push({
    key: "registration",
    label: "Registration",
    value: team?.name
      ? `Registered with ${team.name}`
      : freeAgent
        ? FREE_AGENT_STATUS[freeAgent.status] ?? FREE_AGENT_STATUS.registered
        : signup
          ? "Signed up, teams are drawn before the start"
          : "Registered",
    tone: "ok",
    icon: UserCheck,
  });

  const checkIn = homeCheckIn({
    tournament,
    team,
    freeAgent: team ? null : freeAgent,
    steamId: props.viewer.steamId,
    now: now.value,
  });
  if (checkIn) {
    const text = checkInText(checkIn, (date) => formatStartTime(date.toISOString(), now.value));
    lines.push({ key: "check-in", label: "Check-in", value: text.value, tone: text.tone, icon: CheckCircle2 });
    // Checking in itself happens in the tournament page's check-in panel.
    if (checkIn.canAct && checkIn.actionLabel) {
      action = { label: checkIn.actionLabel, to: `/tournaments/${tournament.id}` };
    }
  } else if (tournament.registration_version !== 2 && signup && !live) {
    const endsAt = tournament.individual_check_in_ends_at;
    if (signup.checked_in_at) {
      lines.push({ key: "check-in", label: "Check-in", value: "Checked in", tone: "ok", icon: CheckCircle2 });
    } else if (endsAt && new Date(endsAt) > now.value) {
      lines.push({
        key: "check-in",
        label: "Check-in",
        value: `Open until ${formatStartTime(endsAt, now.value)}`,
        tone: "hot",
        icon: CheckCircle2,
      });
      action = { label: "Check in", to: `/tournaments/${tournament.id}` };
    }
  }

  const bracket = team ? nextBrackets.value[team.id] : null;
  if (bracket) {
    const opponent =
      bracket.tournament_team_id_1 === team.id ? bracket.team_2 : bracket.team_1;
    const inSchedule =
      !!bracket.match_id &&
      (ACTIVE_MATCH_STATUSES as readonly string[]).includes(bracket.match?.status);
    const when = bracket.scheduled_at ?? bracket.scheduled_eta;
    lines.push({
      key: "opponent",
      label: "Next opponent",
      value: opponent?.name
        ? inSchedule
          ? `${opponent.name} (see your scheduled matches)`
          : when
            ? `${opponent.name} · ${formatStartTime(when, now.value)}`
            : opponent.name
        : "To be decided",
      tone: inSchedule ? "muted" : "ok",
      icon: Swords,
    });
  }

  if (live) {
    const stages = tournament.stages ?? [];
    const current = stages.find((stage: any) => stage.order === tournament.current_stage);
    const results = team?.results;
    const parts = [
      stages.length > 1 && current ? `Stage ${current.order} of ${stages.length}` : null,
      current?.e_tournament_stage_type?.description ?? null,
      results ? `${results.wins ?? 0}W ${results.losses ?? 0}L` : null,
    ].filter(Boolean);
    lines.push({
      key: "progress",
      label: "Progress",
      value: parts.join(" · ") || "In progress",
      tone: "live",
      icon: Trophy,
    });
  }

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.e_tournament_status?.description ?? tournament.status,
    statusTone: statusTone(tournament.status),
    when: start ? formatStartTime(tournament.start, now.value) : null,
    relative: !start ? "" : start > now.value ? relativeWhen(start, now.value, t) : "Started",
    teams: tournament.teams_aggregate?.aggregate?.count ?? null,
    lines,
    action,
  };
}

// tournament_free_agents.status, worded like TournamentFreeAgents.
const FREE_AGENT_STATUS: Record<string, string> = {
  registered: "Free agent, waiting to be drafted",
  waitlisted: "Free agent, on the waitlist",
  drafted: "Drafted, team being set up",
};

const cards = computed(() => tournaments.value.map(cardModel));

const toneClasses: Record<Tone, string> = {
  hot: "font-semibold text-[hsl(var(--tac-amber))]",
  live: "font-semibold text-destructive",
  ok: "text-foreground/90",
  muted: "text-muted-foreground",
};
</script>

<template>
  <section
    v-if="cards.length"
    aria-labelledby="home-tournament-title"
    :class="[homePanelClasses, homePanelPaddingClasses]"
    data-testid="home-your-tournament"
  >
    <HomeSectionHeader
      id="home-tournament-title"
      :title="cards.length > 1 ? 'Your Tournaments' : 'Your Tournament'"
      :sample="sample"
    />
    <div class="grid gap-3">
      <article
        v-for="card in cards"
        :key="card.id"
        class="relative overflow-hidden rounded-lg border border-border bg-muted/20 p-3.5"
      >
        <span
          aria-hidden="true"
          class="absolute inset-y-0 left-0 w-[3px]"
          :class="card.statusTone === 'live' ? 'bg-destructive' : 'bg-[hsl(var(--tac-amber))]'"
        ></span>
        <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-base font-bold">{{ card.name }}</h3>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <span :class="toneClasses[card.statusTone]">{{ card.status }}</span>
              <template v-if="card.teams"> · {{ card.teams }} teams</template>
            </p>
          </div>
          <div v-if="card.when" class="shrink-0 text-right">
            <p class="inline-flex items-center gap-1.5 text-sm font-bold tabular-nums">
              <CalendarClock class="size-3.5 text-muted-foreground" aria-hidden="true" />
              {{ card.when }}
            </p>
            <p v-if="card.relative" class="text-xs text-muted-foreground">{{ card.relative }}</p>
          </div>
        </div>

        <dl class="mt-3 grid gap-2 sm:grid-cols-2">
          <div
            v-for="line in card.lines"
            :key="line.key"
            class="flex min-w-0 items-start gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
          >
            <component :is="line.icon" class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div class="min-w-0">
              <dt class="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {{ line.label }}
              </dt>
              <dd class="text-[13px] leading-snug" :class="toneClasses[line.tone]">{{ line.value }}</dd>
            </div>
          </div>
        </dl>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <NuxtLink
            v-if="card.action"
            :to="card.action.to"
            class="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tac-amber))] px-3 py-1.5 text-xs font-bold text-black hover:bg-[hsl(var(--tac-amber)/0.85)]"
            data-testid="home-tournament-check-in"
          >
            <CheckCircle2 class="size-3.5" aria-hidden="true" />
            {{ card.action.label }}
          </NuxtLink>
          <NuxtLink
            :to="`/tournaments/${card.id}`"
            class="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--tac-amber))] hover:underline"
          >
            Open tournament
            <ArrowRight class="size-3" aria-hidden="true" />
          </NuxtLink>
        </div>
      </article>
    </div>
  </section>
</template>
