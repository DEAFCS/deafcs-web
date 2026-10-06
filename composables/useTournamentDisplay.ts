// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { tournamentRegistrationCount } from "~/utilities/tournamentRegistrationCount";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { e_tournament_status_enum } from "~/generated/zeus";
import { formatPrizePool } from "~/utilities/prizePool";
import { tournamentMapPosters } from "~/utilities/tournamentMapPosters";
import {
  matchTypeLabel,
  tournamentChampion,
  tournamentRowState,
} from "~/utilities/watchEventCard";

// Status and category descriptions come from the database in title case;
// keep acronyms (LAN) and lower the rest so the line reads as a sentence.
export function sentenceCase(value: string) {
  return value
    .split(" ")
    .map((word, index) =>
      index === 0 || word === word.toUpperCase() ? word : word.toLowerCase(),
    )
    .join(" ");
}

// The bits every tournament surface on /tournaments shows, read the same way
// WatchTournamentCard reads them.
export function useTournamentDisplay(source: () => any) {
  const { t } = useI18n();
  const runtimeConfig = useRuntimeConfig();
  const tournament = computed(source);

  const state = computed(() => tournamentRowState(tournament.value?.status));
  const paused = computed(
    () => tournament.value?.status === e_tournament_status_enum.Paused,
  );
  const registrationOpen = computed(
    () =>
      tournament.value?.status === e_tournament_status_enum.RegistrationOpen,
  );

  const bannerSrc = computed(() => {
    if (tournament.value?.banner) {
      return `https://${runtimeConfig.public.apiDomain}/${tournament.value.banner}`;
    }
    return tournamentMapPosters(tournament.value, 1)[0] ?? null;
  });

  const statusLabel = computed(() => {
    if (paused.value) return t("common.paused");
    if (state.value === "live" && !paused.value) return t("event.phase.live");
    const description = tournament.value?.e_tournament_status?.description;
    return description ? sentenceCase(description) : null;
  });

  const categories = computed(() =>
    (tournament.value?.categories || [])
      .map((category: any) =>
        sentenceCase(
          category.e_tournament_category?.description ?? category.category,
        ),
      )
      .slice(0, 2),
  );

  const sub = computed(() => {
    const parts: string[] = [];
    const organizer =
      tournament.value?.organizer_teams?.[0]?.team?.name ||
      tournament.value?.admin?.name;
    if (organizer) {
      parts.push(t("pages.watch.tournaments.by", { name: organizer }));
    }
    parts.push(matchTypeLabel(tournament.value?.options?.type));
    if (tournament.value?.options?.best_of) {
      parts.push(
        t("pages.watch.tournaments.best_of", {
          count: tournament.value.options.best_of,
        }),
      );
    }
    return parts.join(" · ");
  });

  const registrationCount = computed(() => tournamentRegistrationCount(tournament.value));
  const teams = computed(() => registrationCount.value.count);
  const maxTeams = computed(() => registrationCount.value.capacity);
  const teamsLabel = computed(() => {
    const unit = registrationCount.value.unit === "players" ? t("tournament.registration.count_players") : t("pages.watch.events.count_teams", maxTeams.value || teams.value);
    return (maxTeams.value > 0 ? teams.value + " / " + maxTeams.value : String(teams.value)) + " " + unit;
  });
  const spotsLeft = computed(() => Math.max(0, maxTeams.value - teams.value));

  const prizePool = computed(() => formatPrizePool(tournament.value?.prizes));
  const champion = computed(() =>
    state.value === "finished" ? tournamentChampion(tournament.value) : null,
  );

  const start = computed(() =>
    tournament.value?.start ? new Date(tournament.value.start) : null,
  );
  // "en-GB" rather than the viewer's browser/UI locale: DEAFCS always shows
  // weekday/month names in English and time in 24-hour form (no AM/PM),
  // while still formatting in the viewer's own local timezone -- Intl only
  // ever localizes the text, never the moment in time.
  const startDay = computed(() =>
    start.value
      ? new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(start.value)
      : null,
  );
  const startTime = computed(() =>
    start.value
      ? new Intl.DateTimeFormat("en-GB", {
          hour: "numeric",
          minute: "2-digit",
        }).format(start.value)
      : null,
  );

  return {
    state,
    paused,
    registrationOpen,
    bannerSrc,
    statusLabel,
    categories,
    sub,
    teams,
    maxTeams,
    teamsLabel,
    spotsLeft,
    prizePool,
    champion,
    start,
    startDay,
    startTime,
  };
}
