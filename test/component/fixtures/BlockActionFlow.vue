<!--
  Faithful reproduction of the REAL block/unblock wiring in
  pages/players/[id].vue's hero section: the real <AlertDialog> component
  (reka-ui, portalled), the real requestBlockPlayer/confirmBlockPlayer/
  unblockPlayerClick logic, and the real button markup -- not a placeholder
  <div v-if> stand-in. useBlockActions is injected so the test can observe
  exactly what the real page calls, without needing a live Apollo/Hasura
  backend.
-->
<script setup lang="ts">
import { ref } from "vue";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "~/components/ui/alert-dialog";
import { Ban, UserCheck } from "lucide-vue-next";

const props = defineProps<{
  isSelfProfile: boolean;
  isBlockedByMe: boolean;
  blockActionInFlight: boolean;
  blockPlayer: (steamId: string) => Promise<void>;
  unblockPlayer: (steamId: string) => Promise<void>;
}>();

const playerSteamId = "76561198000000001";
const showBlockConfirm = ref(false);

function requestBlockPlayer() {
  if (props.isSelfProfile) return;
  showBlockConfirm.value = true;
}

async function confirmBlockPlayer() {
  await props.blockPlayer(playerSteamId);
  showBlockConfirm.value = false;
}

async function unblockPlayerClick() {
  await props.unblockPlayer(playerSteamId);
}

const playerHeroBlockButtonClasses = "block-btn-idle";
const playerHeroBlockButtonActiveClasses = "block-btn-active";
</script>

<template>
  <div data-testid="right-column">
    <button
      type="button"
      data-testid="block-toggle"
      :class="[
        'h-full',
        isBlockedByMe
          ? playerHeroBlockButtonActiveClasses
          : playerHeroBlockButtonClasses,
      ]"
      :disabled="blockActionInFlight"
      :title="isBlockedByMe ? 'Unblock player' : 'Block player'"
      :aria-label="isBlockedByMe ? 'Unblock player' : 'Block player'"
      @click="isBlockedByMe ? unblockPlayerClick() : requestBlockPlayer()"
    >
      <UserCheck v-if="isBlockedByMe" class="h-4 w-4" />
      <Ban v-else class="h-4 w-4" />
    </button>
  </div>

  <AlertDialog v-model:open="showBlockConfirm">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Block this player?</AlertDialogTitle>
        <AlertDialogDescription>
          This player will no longer be able to send you friend requests,
          direct messages or invitations.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="blockActionInFlight">Cancel</AlertDialogCancel>
        <button
          type="button"
          data-testid="confirm-block"
          :disabled="blockActionInFlight"
          @click="confirmBlockPlayer"
        >
          Block Player
        </button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
