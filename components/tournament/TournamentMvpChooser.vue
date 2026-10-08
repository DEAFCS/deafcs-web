<script setup lang="ts">
import gql from "graphql-tag";
import { computed, ref } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { useI18n } from "vue-i18n";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { toast } from "~/components/ui/toast";
import { tournamentMvpEnabled } from "~/utilities/tournamentAwardPicker";

// Manual tournament MVP (a deliberate DEAFCS difference from upstream, which
// picks automatically). Organizers choose one MVP once the tournament has
// finished, from players who actually played. The stats are guidance only:
// the list is alphabetical, nothing is ranked, highlighted or recommended.
// Who may use this is enforced by the API; this panel is only shown to the
// tournament's organizers.
const props = defineProps<{
  tournamentId: string;
  matchType?: string | null;
  minPlayersPerLineup?: number | null;
  finished: boolean;
}>();

const { t } = useI18n();
const { client } = useApolloClient();

const CURRENT_MVP_QUERY = gql`
  query TournamentCurrentMvp($tournamentId: uuid!) {
    award_recipients(
      where: {
        revoked_at: { _is_null: true }
        occurrence: {
          tournament_id: { _eq: $tournamentId }
          placement: { _eq: 0 }
        }
      }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      player_steam_id
      recipient_note
      player {
        steam_id
        name
      }
      tournament_team {
        id
        name
        team {
          id
          name
        }
      }
    }
  }
`;

const CANDIDATES_QUERY = gql`
  query TournamentMvpCandidates($tournamentId: uuid!) {
    tournamentMvpCandidates(tournament_id: $tournamentId) {
      player_steam_id
      player_name
      tournament_team_id
      team_name
      matches_played
      rating
      kills
      deaths
      assists
    }
  }
`;

const SET_MVP_MUTATION = gql`
  mutation SetTournamentMvp(
    $tournamentId: uuid!
    $playerSteamId: bigint!
    $note: String
  ) {
    setTournamentMvp(
      tournament_id: $tournamentId
      player_steam_id: $playerSteamId
      note: $note
    ) {
      success
    }
  }
`;

const CLEAR_MVP_MUTATION = gql`
  mutation ClearTournamentMvp($tournamentId: uuid!, $note: String) {
    clearTournamentMvp(tournament_id: $tournamentId, note: $note) {
      success
    }
  }
`;

interface Candidate {
  player_steam_id: string;
  player_name: string;
  tournament_team_id: string | null;
  team_name: string | null;
  matches_played: number;
  rating: number;
  kills: number;
  deaths: number;
  assists: number;
}

interface CurrentMvp {
  id: string;
  player_steam_id: string;
  recipient_note: string | null;
  player: { steam_id: string; name: string } | null;
  tournament_team: {
    id: string;
    name: string | null;
    team: { id: string; name: string } | null;
  } | null;
}

const enabled = computed(() =>
  tournamentMvpEnabled(props.matchType, props.minPlayersPerLineup),
);

const current = ref<CurrentMvp | null>(null);
const loadedCurrent = ref(false);
const candidates = ref<Candidate[]>([]);
const loadingCandidates = ref(false);
const candidatesError = ref<string | null>(null);

const chooseOpen = ref(false);
const clearOpen = ref(false);
const selected = ref<string | null>(null);
const confirming = ref(false);
const note = ref("");
const saving = ref(false);

const selectedCandidate = computed(
  () =>
    candidates.value.find((c) => c.player_steam_id === selected.value) ?? null,
);

const currentTeamName = computed(
  () =>
    current.value?.tournament_team?.team?.name ??
    current.value?.tournament_team?.name ??
    "",
);

async function loadCurrent() {
  const { data } = await client.query({
    query: CURRENT_MVP_QUERY,
    variables: { tournamentId: props.tournamentId },
    fetchPolicy: "network-only",
  });
  current.value = data?.award_recipients?.[0] ?? null;
  loadedCurrent.value = true;
}

async function openChoose() {
  selected.value = current.value?.player_steam_id ?? null;
  confirming.value = false;
  note.value = "";
  candidatesError.value = null;
  chooseOpen.value = true;
  loadingCandidates.value = true;
  try {
    const { data } = await client.query({
      query: CANDIDATES_QUERY,
      variables: { tournamentId: props.tournamentId },
      fetchPolicy: "network-only",
    });
    candidates.value = data?.tournamentMvpCandidates ?? [];
  } catch (error: any) {
    candidatesError.value = error?.message ?? t("tournament.mvp.load_failed");
    candidates.value = [];
  } finally {
    loadingCandidates.value = false;
  }
}

function openClear() {
  note.value = "";
  clearOpen.value = true;
}

async function confirmChoice() {
  if (!selectedCandidate.value || saving.value) return;
  saving.value = true;
  try {
    await client.mutate({
      mutation: SET_MVP_MUTATION,
      variables: {
        tournamentId: props.tournamentId,
        playerSteamId: selectedCandidate.value.player_steam_id,
        note: note.value.trim() || null,
      },
    });
    chooseOpen.value = false;
    toast({ title: t("tournament.mvp.saved") });
    await loadCurrent();
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: t("common.error"),
      description: error?.message,
    });
  } finally {
    saving.value = false;
  }
}

async function confirmClear() {
  if (saving.value) return;
  saving.value = true;
  try {
    await client.mutate({
      mutation: CLEAR_MVP_MUTATION,
      variables: {
        tournamentId: props.tournamentId,
        note: note.value.trim() || null,
      },
    });
    clearOpen.value = false;
    toast({ title: t("tournament.mvp.cleared") });
    await loadCurrent();
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: t("common.error"),
      description: error?.message,
    });
  } finally {
    saving.value = false;
  }
}

if (enabled.value) {
  void loadCurrent().catch(() => {
    loadedCurrent.value = true;
  });
}

defineExpose({ openChoose, confirmChoice, confirmClear, selected, note });
</script>

<template>
  <section
    v-if="enabled"
    class="mt-6 space-y-4 rounded-md border border-border bg-card/40 p-4"
    data-testid="tournament-mvp-chooser"
  >
    <header class="space-y-1">
      <h3 class="text-sm font-semibold">{{ $t("tournament.mvp.title") }}</h3>
      <p class="text-sm text-muted-foreground">
        {{ $t("tournament.mvp.description") }}
      </p>
    </header>

    <p
      v-if="!finished"
      class="text-sm text-muted-foreground"
      data-testid="tournament-mvp-not-finished"
    >
      {{ $t("tournament.mvp.after_finish") }}
    </p>

    <template v-else>
      <div
        class="flex flex-wrap items-center justify-between gap-3"
        data-testid="tournament-mvp-current"
      >
        <p v-if="current" class="text-sm">
          <span class="font-medium">{{
            current.player?.name ?? current.player_steam_id
          }}</span>
          <span v-if="currentTeamName" class="text-muted-foreground">
            · {{ currentTeamName }}</span
          >
        </p>
        <p v-else-if="loadedCurrent" class="text-sm text-muted-foreground">
          {{ $t("tournament.mvp.none") }}
        </p>

        <div class="flex gap-2">
          <Button
            size="sm"
            data-testid="tournament-mvp-choose"
            @click="openChoose"
          >
            {{
              current
                ? $t("tournament.mvp.change")
                : $t("tournament.mvp.choose")
            }}
          </Button>
          <Button
            v-if="current"
            size="sm"
            variant="outline"
            data-testid="tournament-mvp-clear"
            @click="openClear"
          >
            {{ $t("tournament.mvp.clear") }}
          </Button>
        </div>
      </div>
    </template>

    <Dialog v-model:open="chooseOpen">
      <DialogContent class="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{{ $t("tournament.mvp.dialog_title") }}</DialogTitle>
          <DialogDescription>{{
            $t("tournament.mvp.dialog_description")
          }}</DialogDescription>
        </DialogHeader>

        <template v-if="!confirming">
          <p v-if="loadingCandidates" class="text-sm text-muted-foreground">
            {{ $t("common.loading") }}
          </p>
          <p v-else-if="candidatesError" class="text-sm text-destructive">
            {{ candidatesError }}
          </p>
          <p
            v-else-if="!candidates.length"
            class="text-sm text-muted-foreground"
          >
            {{ $t("tournament.mvp.no_candidates") }}
          </p>
          <div v-else class="max-h-[50vh] overflow-auto">
            <table
              class="w-full text-sm"
              data-testid="tournament-mvp-candidates"
            >
              <thead
                class="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground"
              >
                <tr>
                  <th class="py-2 pr-2"></th>
                  <th class="py-2 pr-3">{{ $t("tournament.mvp.player") }}</th>
                  <th class="py-2 pr-3">{{ $t("tournament.mvp.team") }}</th>
                  <th class="py-2 pr-3 text-right">
                    {{ $t("tournament.mvp.matches") }}
                  </th>
                  <th class="py-2 pr-3 text-right">
                    {{ $t("tournament.mvp.rating") }}
                  </th>
                  <th class="py-2 pr-3 text-right">K</th>
                  <th class="py-2 pr-3 text-right">D</th>
                  <th class="py-2 text-right">A</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="candidate in candidates"
                  :key="candidate.player_steam_id"
                  class="cursor-pointer border-t border-border/60 hover:bg-accent/40"
                  :class="
                    selected === candidate.player_steam_id ? 'bg-accent/60' : ''
                  "
                  data-testid="tournament-mvp-candidate"
                  @click="selected = candidate.player_steam_id"
                >
                  <td class="py-2 pr-2">
                    <input
                      type="radio"
                      name="tournament-mvp"
                      :value="candidate.player_steam_id"
                      :checked="selected === candidate.player_steam_id"
                      :aria-label="candidate.player_name"
                      @change="selected = candidate.player_steam_id"
                    />
                  </td>
                  <td class="py-2 pr-3 font-medium">
                    {{ candidate.player_name }}
                  </td>
                  <td class="py-2 pr-3 text-muted-foreground">
                    {{ candidate.team_name ?? "-" }}
                  </td>
                  <td class="py-2 pr-3 text-right tabular-nums">
                    {{ candidate.matches_played }}
                  </td>
                  <td class="py-2 pr-3 text-right tabular-nums">
                    {{ candidate.rating ? candidate.rating.toFixed(2) : "-" }}
                  </td>
                  <td class="py-2 pr-3 text-right tabular-nums">
                    {{ candidate.kills }}
                  </td>
                  <td class="py-2 pr-3 text-right tabular-nums">
                    {{ candidate.deaths }}
                  </td>
                  <td class="py-2 text-right tabular-nums">
                    {{ candidate.assists }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ $t("tournament.mvp.guidance") }}
          </p>
        </template>

        <div v-else class="space-y-3" data-testid="tournament-mvp-confirm">
          <p class="text-sm">
            {{
              $t("tournament.mvp.confirm", {
                player: selectedCandidate?.player_name ?? "",
              })
            }}
          </p>
          <Textarea
            v-model="note"
            :placeholder="$t('tournament.mvp.note_placeholder')"
            maxlength="200"
            rows="2"
          />
        </div>

        <DialogFooter>
          <template v-if="!confirming">
            <Button variant="outline" @click="chooseOpen = false">{{
              $t("common.cancel")
            }}</Button>
            <Button
              :disabled="!selectedCandidate"
              data-testid="tournament-mvp-continue"
              @click="confirming = true"
            >
              {{ $t("tournament.mvp.continue") }}
            </Button>
          </template>
          <template v-else>
            <Button variant="outline" @click="confirming = false">{{
              $t("common.back")
            }}</Button>
            <Button
              :disabled="saving"
              data-testid="tournament-mvp-confirm-button"
              @click="confirmChoice"
            >
              {{ $t("tournament.mvp.confirm_button") }}
            </Button>
          </template>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="clearOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t("tournament.mvp.clear_title") }}</DialogTitle>
          <DialogDescription>{{
            $t("tournament.mvp.clear_description")
          }}</DialogDescription>
        </DialogHeader>
        <Textarea
          v-model="note"
          :placeholder="$t('tournament.mvp.note_placeholder')"
          maxlength="200"
          rows="2"
        />
        <DialogFooter>
          <Button variant="outline" @click="clearOpen = false">{{
            $t("common.cancel")
          }}</Button>
          <Button
            variant="destructive"
            :disabled="saving"
            data-testid="tournament-mvp-clear-confirm"
            @click="confirmClear"
          >
            {{ $t("tournament.mvp.clear") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
