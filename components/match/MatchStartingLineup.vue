<script lang="ts">
import { ListChecks } from "lucide-vue-next";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import TournamentChip from "~/components/tournament/TournamentChip.vue";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { toast } from "~/components/ui/toast";
import { $ } from "~/generated/zeus";
import { generateQuery } from "~/graphql/graphqlGen";
import { playerFields } from "~/graphql/playerFields";
import { runTournamentAction } from "~/utilities/tournamentActions";

type Roster = {
  id: string;
  name: string;
  captain_steam_id: string | null;
  owner_steam_id: string | null;
  roster: Array<{
    player_steam_id: string;
    role: string;
    player: Record<string, any> | null;
  }>;
};

// Who plays THIS tournament match. A tournament roster may hold substitutes;
// the match lineup is exactly the starting size, so the players on it are the
// active ones and everyone else on the roster is a substitute for this match.
// The API decides who may change it and until when (the match start); this
// panel only offers the choice to people who could be allowed, while the
// match has not started.
export default {
  components: {
    ListChecks,
    PlayerDisplay,
    TournamentChip,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  },
  props: {
    match: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      rosters: { 1: null, 2: null } as Record<1 | 2, Roster | null>,
      needsConfirmation: { 1: false, 2: false } as Record<1 | 2, boolean>,
      open: false,
      saving: false,
      editingTeam: 1 as 1 | 2,
      selected: [] as string[],
    };
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
    bracketId(): string | null {
      return this.match?.tournament_brackets?.[0]?.id ?? null;
    },
    startingSize(): number {
      return Number(this.match?.min_players_per_lineup) || 0;
    },
    editable(): boolean {
      return ["Scheduled", "WaitingForCheckIn"].includes(this.match?.status);
    },
    visibleTeams(): Array<1 | 2> {
      return ([1, 2] as const).filter((team) => this.hasBench(team));
    },
    captainSteamId(): string {
      return String(this.rosters[this.editingTeam]?.captain_steam_id ?? "");
    },
    valid(): boolean {
      return this.selected.length === this.startingSize;
    },
    // Re-read the rosters when a lineup changes (a roster edit or another
    // organizer's choice), so Active and Substitute never go stale.
    lineupSignature(): string {
      return ([1, 2] as const)
        .map((team) => [...this.activeIds(team)].sort().join(","))
        .join("|");
    },
  },
  watch: {
    bracketId: {
      immediate: true,
      handler() {
        this.loadRosters();
      },
    },
    lineupSignature() {
      this.loadRosters();
    },
  },
  methods: {
    async loadRosters() {
      if (!this.bracketId || !this.$apollo) {
        return;
      }
      const team = {
        id: true,
        name: true,
        captain_steam_id: true,
        owner_steam_id: true,
        roster: [
          {},
          {
            player_steam_id: true,
            role: true,
            player: playerFields,
          },
        ],
      };
      try {
        const { data } = await this.$apollo.query({
          query: generateQuery({
            tournament_brackets_by_pk: [
              { id: $("bracketId", "uuid!") },
              {
                id: true,
                team_1: team,
                team_2: team,
                // Whether each side still has to confirm its starters (a team
                // with substitutes cannot check in before it does).
                match: {
                  lineup_1: { id: true, needs_starting_lineup_confirmation: true },
                  lineup_2: { id: true, needs_starting_lineup_confirmation: true },
                },
              },
            ],
          } as any),
          variables: { bracketId: this.bracketId },
          fetchPolicy: "network-only",
        });
        const bracket = (data as any)?.tournament_brackets_by_pk;
        this.rosters = {
          1: bracket?.team_1 ?? null,
          2: bracket?.team_2 ?? null,
        };
        this.needsConfirmation = {
          1: !!bracket?.match?.lineup_1?.needs_starting_lineup_confirmation,
          2: !!bracket?.match?.lineup_2?.needs_starting_lineup_confirmation,
        };
      } catch {
        // The panel is an addition to check-in: without the rosters it stays
        // out of the way rather than blocking the page.
        this.rosters = { 1: null, 2: null };
      }
    },
    lineupOf(team: 1 | 2) {
      return this.match?.[`lineup_${team}`] ?? null;
    },
    activeIds(team: 1 | 2): Set<string> {
      return new Set(
        (this.lineupOf(team)?.lineup_players ?? []).map((p: any) =>
          String(p.steam_id),
        ),
      );
    },
    hasBench(team: 1 | 2) {
      const roster = this.rosters[team]?.roster ?? [];
      return this.startingSize > 0 && roster.length > this.startingSize;
    },
    // A hint, not the rule: the captain, the team's owner or Admin, and the
    // tournament's organizers may choose, and the API says no to anyone else.
    canChoose(team: 1 | 2) {
      if (!this.editable || !this.hasBench(team) || !this.me) {
        return false;
      }
      if (this.match?.can_start) {
        return true;
      }
      const entry = this.rosters[team];
      const steamId = String(this.me.steam_id);
      return (
        String(entry?.captain_steam_id ?? "") === steamId ||
        String(entry?.owner_steam_id ?? "") === steamId ||
        !!entry?.roster?.some(
          (row) =>
            String(row.player_steam_id) === steamId && row.role === "Admin",
        )
      );
    },
    teamName(team: 1 | 2) {
      return (
        this.lineupOf(team)?.name ||
        this.rosters[team]?.name ||
        this.$t(`match.lineup.lineup_${team}`)
      );
    },
    rosterRows(team: 1 | 2) {
      const active = this.activeIds(team);
      return (this.rosters[team]?.roster ?? [])
        .slice()
        .sort((a, b) => {
          const left = active.has(String(a.player_steam_id)) ? 0 : 1;
          const right = active.has(String(b.player_steam_id)) ? 0 : 1;
          return left - right;
        })
        .map((row) => ({
          ...row,
          active: active.has(String(row.player_steam_id)),
        }));
    },
    isSelected(steamId: string) {
      return this.selected.includes(String(steamId));
    },
    isLocked(steamId: string) {
      // The tournament captain may sit a match out, so nobody is pinned.
      return (
        !this.isSelected(steamId) && this.selected.length >= this.startingSize
      );
    },
    // Same dialog for confirming the default and for changing a lineup; the
    // wording follows what is still owed.
    actionLabel(team: 1 | 2) {
      return this.needsConfirmation[team]
        ? this.$t("match.starting_lineup.confirm")
        : this.$t("match.starting_lineup.select");
    },
    startEditing(team: 1 | 2) {
      this.editingTeam = team;
      this.selected = [...this.activeIds(team)];
      this.open = true;
    },
    toggle(steamId: string, checked: boolean | "indeterminate") {
      const next = new Set(this.selected);
      if (checked === true) {
        if (next.size >= this.startingSize) {
          return;
        }
        next.add(String(steamId));
      } else {
        next.delete(String(steamId));
      }
      this.selected = [...next];
    },
    async save() {
      const lineup = this.lineupOf(this.editingTeam);
      if (!lineup || !this.valid || this.saving) {
        return;
      }
      this.saving = true;
      try {
        const data = await runTournamentAction(
          this.$apollo,
          {
            setMatchStartingLineup: [
              {
                match_id: this.match.id,
                match_lineup_id: lineup.id,
                steam_ids: this.selected,
              },
              { success: true },
            ],
          },
          this.$t("match.starting_lineup.save_failed"),
        );
        if (data) {
          toast({ title: this.$t("match.starting_lineup.saved") });
          this.open = false;
          await this.loadRosters();
        }
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<template>
  <section
    v-if="visibleTeams.length > 0"
    class="flex min-w-0 flex-col gap-3"
    data-testid="starting-lineup"
  >
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        v-for="team in visibleTeams"
        :key="team"
        class="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
        :data-testid="`starting-lineup-team-${team}`"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="truncate font-sans text-sm font-bold uppercase tracking-[0.14em]"
          >
            {{ teamName(team) }}
          </span>
          <Button
            v-if="canChoose(team)"
            variant="outline"
            size="sm"
            class="h-7 shrink-0"
            data-testid="select-starting-lineup"
            @click="startEditing(team)"
          >
            <ListChecks class="mr-1.5 h-3.5 w-3.5" />
            {{ actionLabel(team) }}
          </Button>
        </div>
        <p
          v-if="needsConfirmation[team]"
          class="text-xs text-muted-foreground"
          data-testid="starting-lineup-needs-confirmation"
        >
          {{ $t("match.starting_lineup.needs_confirmation") }}
        </p>
        <ul class="flex flex-col gap-1">
          <li
            v-for="row in rosterRows(team)"
            :key="row.player_steam_id"
            class="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1"
            :class="{ 'opacity-60': !row.active }"
            :data-testid="`starting-lineup-player-${row.player_steam_id}`"
            :data-active="row.active ? 'true' : 'false'"
          >
            <div class="min-w-0 flex-1">
              <PlayerDisplay
                v-if="row.player"
                :player="row.player"
                dense
                size="xs"
                :show-online="false"
                :show-flag="false"
                :show-elo="false"
                :show-add-friend="false"
                :truncate-name="true"
              />
              <span v-else class="block truncate text-sm">{{
                row.player_steam_id
              }}</span>
            </div>
            <TournamentChip :tone="row.active ? 'ok' : 'muted'">
              {{
                row.active
                  ? $t("match.starting_lineup.active")
                  : $t("match.starting_lineup.substitute")
              }}
            </TournamentChip>
          </li>
        </ul>
      </div>
    </div>

    <Dialog v-model:open="open">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ actionLabel(editingTeam) }}</DialogTitle>
          <DialogDescription>
            {{
              $t("match.starting_lineup.pick_hint", { count: startingSize })
            }}
          </DialogDescription>
        </DialogHeader>
        <ul class="flex flex-col gap-1">
          <li
            v-for="row in rosters[editingTeam]?.roster ?? []"
            :key="row.player_steam_id"
          >
            <label
              class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <Checkbox
                :model-value="isSelected(row.player_steam_id)"
                :disabled="isLocked(row.player_steam_id)"
                @update:model-value="
                  (checked: boolean | 'indeterminate') =>
                    toggle(row.player_steam_id, checked)
                "
              />
              <div class="min-w-0 flex-1">
                <PlayerDisplay
                  v-if="row.player"
                  :player="row.player"
                  dense
                  size="xs"
                  :show-online="false"
                  :show-flag="false"
                  :show-elo="false"
                  :show-add-friend="false"
                  :truncate-name="true"
                />
              </div>
              <span
                v-if="String(row.player_steam_id) === captainSteamId"
                class="shrink-0 text-xs text-muted-foreground"
              >
                {{ $t("match.starting_lineup.captain_plays") }}
              </span>
            </label>
          </li>
        </ul>
        <DialogFooter class="items-center gap-2 sm:justify-between">
          <span class="text-xs text-muted-foreground">
            {{
              $t("match.starting_lineup.count", {
                selected: selected.length,
                count: startingSize,
              })
            }}
          </span>
          <Button :disabled="!valid || saving" @click="save">
            {{
              needsConfirmation[editingTeam]
                ? $t("match.starting_lineup.confirm")
                : $t("match.starting_lineup.save")
            }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
