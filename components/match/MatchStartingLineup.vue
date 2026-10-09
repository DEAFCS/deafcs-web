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
import CheckIntoMatch from "~/components/match/CheckIntoMatch.vue";
import { $, e_player_roles_enum } from "~/generated/zeus";
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

// One team's lineup control inside its check-in row. A tournament roster may
// hold substitutes; the match lineup is exactly the starting size, so the
// players on it are the active ones and everyone else on the roster is a
// substitute for this match. "Edit Lineup" only exists for a team with more
// players than the match size. Checking in is the confirmation: a team with
// substitutes checks in with "Confirm Lineup", which confirms the lineup it is
// seated with and checks in. The API decides who may change the lineup and
// until when; this only offers the choice to people who could be allowed.
export default {
  components: {
    CheckIntoMatch,
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
    team: {
      type: Number as () => 1 | 2,
      required: true,
    },
    // The check-in wording. Checking in also confirms the lineup the team is
    // seated with (the API does that), so the button is simply Check In.
    checkInLabel: {
      type: String,
      default: null,
    },
    // "edit" is only Edit Lineup (placed under a team card), "check-in" only
    // the team check-in; "both" is the row control used for team check-in.
    part: {
      type: String as () => "both" | "edit" | "check-in",
      default: "both",
    },
  },
  data() {
    return {
      rosters: { 1: null, 2: null } as Record<1 | 2, Roster | null>,
      open: false,
      saving: false,
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
    showEdit(): boolean {
      return this.part !== "check-in" && this.canChoose(this.team);
    },
    showCheckIn(): boolean {
      return this.part !== "edit" && this.viewerInTeam;
    },
    // The viewer sits in this team match lineup (the one who checks in).
    viewerInTeam(): boolean {
      const steamId = String(this.me?.steam_id ?? "");
      return (
        !!steamId &&
        (this.lineupOf(this.team)?.lineup_players ?? []).some(
          (p: any) => String(p.steam_id) === steamId,
        )
      );
    },
    captainSteamId(): string {
      return String(this.rosters[this.team]?.captain_steam_id ?? "");
    },
    valid(): boolean {
      return this.selected.length === this.startingSize;
    },
    // Re-read the rosters when a lineup changes (a roster edit or another
    // organizer's choice), so Active and Substitute never go stale.
    lineupSignature(): string {
      return [...this.activeIds(this.team)].sort().join(",");
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
      } catch {
        // Editing is an addition to check-in: without the rosters it stays
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
    // A hint, not the rule: the captain, the team's owner or Admin, the
    // tournament's organizers and site administrators (for either team) may
    // choose, and the API says no to anyone else.
    canChoose(team: 1 | 2) {
      if (!this.editable || !this.hasBench(team) || !this.me) {
        return false;
      }
      if (
        this.match?.can_start ||
        useAuthStore().isRoleAbove(e_player_roles_enum.administrator)
      ) {
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
    isSelected(steamId: string) {
      return this.selected.includes(String(steamId));
    },
    isLocked(steamId: string) {
      // The tournament captain may sit a match out, so nobody is pinned.
      return (
        !this.isSelected(steamId) && this.selected.length >= this.startingSize
      );
    },
    startEditing() {
      this.selected = [...this.activeIds(this.team)];
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
      const lineup = this.lineupOf(this.team);
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
  <!-- One team lineup control, placed in its check-in row: Edit Lineup (only
       with substitutes) and the team check-in, labelled Confirm Lineup when
       checking in also confirms a lineup chosen from a bigger roster. -->
  <div
    v-if="showEdit || showCheckIn"
    class="flex min-w-0 flex-wrap items-center gap-2"
    :class="part === 'edit' ? 'mt-3 justify-start' : part === 'check-in' ? 'w-full justify-center' : 'justify-end'"
  >
    <Button
      v-if="showEdit"
      variant="outline"
      size="sm"
      class="h-7 shrink-0"
      data-testid="select-starting-lineup"
      @click="startEditing"
    >
      <ListChecks class="mr-1.5 h-3.5 w-3.5" />
      {{ $t("match.starting_lineup.edit") }}
    </Button>
    <CheckIntoMatch
      v-if="showCheckIn"
      :match="match"
      :label="checkInLabel"
      :centered="part === 'check-in'"
      :class="part === 'check-in' ? 'w-full' : ''"
      data-testid="team-check-in"
    />

    <Dialog v-model:open="open">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ $t("match.starting_lineup.edit") }}</DialogTitle>
          <DialogDescription>
            {{
              $t("match.starting_lineup.pick_hint", { count: startingSize })
            }}
          </DialogDescription>
        </DialogHeader>
        <ul class="flex flex-col gap-1">
          <li
            v-for="row in rosters[team]?.roster ?? []"
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
            {{ $t("match.starting_lineup.save") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
