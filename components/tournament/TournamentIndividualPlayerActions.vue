<script setup lang="ts">
import { computed } from "vue";
import { MoreVertical, UserCheck, UserMinus, LogOut } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

// Row actions for one Solo Random sign-up, mirroring
// TournamentTeamMemberRow.vue's pattern (MoreVertical trigger, destructive
// items in text-destructive, confirmation handled by the parent's
// AlertDialog) so participant management reads the same on both tournament
// types.
//
// Renders nothing at all when the viewer has no action available, which keeps
// the ordinary public list exactly as bare as it was.
//
// The menu lives in its own element, outside PlayerDisplay's NuxtLink, so
// opening it can never navigate to the profile.
const props = defineProps<{
  signup: Record<string, any>;
  canCheckIn: boolean;
  canRemove: boolean;
  isSelf: boolean;
  busy?: boolean;
}>();

defineEmits<{ (e: "check-in"): void; (e: "remove"): void }>();

const hasActions = computed(() => props.canCheckIn || props.canRemove);
</script>

<template>
  <DropdownMenu v-if="hasActions">
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8"
        :disabled="busy"
        :title="$t('common.actions_label')"
        @click.stop.prevent
      >
        <MoreVertical class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuItem v-if="canCheckIn" @click="$emit('check-in')">
        <UserCheck />
        {{
          isSelf
            ? $t("tournament.attendance.check_in_button")
            : $t("tournament.players.check_in_player")
        }}
      </DropdownMenuItem>
      <DropdownMenuSeparator v-if="canCheckIn && canRemove" />
      <!-- Self and organizer collapse to a single destructive item: removing
           yourself IS leaving, so an organizer looking at their own row sees
           "Leave tournament" once, never both. -->
      <DropdownMenuItem
        v-if="canRemove"
        class="text-destructive"
        @click="$emit('remove')"
      >
        <LogOut v-if="isSelf" />
        <UserMinus v-else />
        {{
          isSelf
            ? $t("tournament.team.leave_tournament")
            : $t("tournament.players.remove_player")
        }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
