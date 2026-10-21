<script setup lang="ts">
// DEAFCS: Undo the Last Step, Fix a Mis-pick, Redo the Veto and Give 30
// Seconds More as items of the match's "..." menu, for staff. They open the
// dialogs MatchVetoRecoveryDialogs holds, which also decides who gets them:
// without its state (not staff, or nothing to fix) this renders nothing.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import DropdownMenuItem from "~/components/ui/dropdown-menu/DropdownMenuItem.vue";
import DropdownMenuSeparator from "~/components/ui/dropdown-menu/DropdownMenuSeparator.vue";
import { vetoRecoveryState } from "~/composables/useVetoRecovery";
import {
  lastVetoStep,
  vetoRecoveryItems,
  type VetoRecoveryKey,
} from "~/utilities/vetoRecovery";

const props = defineProps<{
  match: Record<string, any>;
}>();

const { t } = useI18n();

const state = computed(() => vetoRecoveryState(props.match?.id));

const items = computed(() =>
  state.value ? vetoRecoveryItems(t, props.match, state.value.picks) : [],
);

async function select(key: VetoRecoveryKey) {
  const current = state.value;
  if (!current) {
    return;
  }
  switch (key) {
    case "undo_last":
      current.undoStep = lastVetoStep(current.picks);
      current.undoExpected = current.picks.length;
      current.undoOpen = true;
      break;
    case "mispick":
      current.fixStep = Math.max(1, lastVetoStep(current.picks));
      current.fixOpen = true;
      break;
    case "redo":
      current.fixStep = 1;
      current.fixOpen = true;
      break;
    case "time":
      await current.extendVetoClock();
      break;
  }
}
</script>

<template>
  <template v-if="items.length">
    <DropdownMenuSeparator />
    <DropdownMenuItem
      v-for="item in items"
      :key="item.key"
      :data-testid="`match-action-veto-${item.key}`"
      @click="select(item.key)"
    >
      <component :is="item.icon" />
      {{ item.title }}
    </DropdownMenuItem>
  </template>
</template>
