<script setup lang="ts">
// DEAFCS: Reset Veto and Reset Captain Pick as items of the match's "..."
// menu, for staff, each only while it applies. They open the confirm dialogs
// MatchPreMatchRecoveryDialogs holds, which also decides who gets them:
// without its state (not staff) this renders nothing.
import { computed } from "vue";
import { RotateCcw, Users } from "lucide-vue-next";
import DropdownMenuItem from "~/components/ui/dropdown-menu/DropdownMenuItem.vue";
import DropdownMenuSeparator from "~/components/ui/dropdown-menu/DropdownMenuSeparator.vue";
import { preMatchRecoveryState } from "~/composables/usePreMatchRecovery";

const props = defineProps<{
  match: Record<string, any>;
}>();

const state = computed(() => preMatchRecoveryState(props.match?.id));

function open(which: "veto" | "captain_pick") {
  const current = state.value;
  if (!current || current.busy) {
    return;
  }
  current.expected =
    which === "veto" ? current.vetoPicks : current.captainPicks;
  current.confirming = which;
}
</script>

<template>
  <template v-if="state && (state.canResetVeto || state.canResetCaptainPick)">
    <DropdownMenuSeparator />
    <DropdownMenuItem
      v-if="state.canResetVeto"
      data-testid="match-action-reset-veto"
      @click="open('veto')"
    >
      <RotateCcw />
      {{ $t("match.recovery.reset_veto.title") }}
    </DropdownMenuItem>
    <DropdownMenuItem
      v-if="state.canResetCaptainPick"
      data-testid="match-action-reset-captain-pick"
      @click="open('captain_pick')"
    >
      <Users />
      {{ $t("match.recovery.reset_captain_pick.title") }}
    </DropdownMenuItem>
  </template>
</template>
