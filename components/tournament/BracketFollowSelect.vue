<script setup lang="ts">
import { computed, onUnmounted } from "vue";
import { Route } from "lucide-vue-next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useBracketView } from "~/composables/useBracketView";

// "Follow team": pick a team and its path through the bracket is highlighted.
// Adapted from 5Stack's BracketFollowSelect (MIT).
const props = defineProps<{
  teams: {
    id: string;
    name?: string | null;
    team?: { name?: string | null } | null;
  }[];
}>();

// Select items cannot carry an empty value, so "stop following" is a sentinel.
const NONE = "__none__";

const { followTeamId } = useBracketView();

const options = computed(() =>
  (props.teams ?? [])
    .map((team) => ({ id: team.id, name: team.team?.name || team.name || "" }))
    .filter((team) => team.name)
    .sort((a, b) => a.name.localeCompare(b.name)),
);

const value = computed({
  get: () => followTeamId.value ?? undefined,
  set: (next?: string) => {
    followTeamId.value = !next || next === NONE ? null : next;
  },
});

onUnmounted(() => {
  followTeamId.value = null;
});
</script>

<template>
  <Select v-if="options.length > 1" v-model="value">
    <SelectTrigger
      class="h-8 w-[11rem] gap-2 text-xs"
      :class="value && 'border-[hsl(var(--tac-amber)/0.55)] text-[hsl(var(--tac-amber))]'"
      :aria-label="$t('tournament.bracket.follow_team')"
      data-testid="bracket-follow-team"
    >
      <Route class="h-3.5 w-3.5 shrink-0" />
      <SelectValue :placeholder="$t('tournament.bracket.follow_team')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-if="value" :value="NONE">
        {{ $t("tournament.bracket.follow_none") }}
      </SelectItem>
      <SelectItem v-for="team in options" :key="team.id" :value="team.id">
        {{ team.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
