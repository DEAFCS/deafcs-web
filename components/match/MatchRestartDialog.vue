<script setup lang="ts">
import { useI18n } from "vue-i18n";
import gql from "graphql-tag";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";

// Restart Match (5stackgg/web #895, "reopen" case only): back to check-in on a
// new server. DEAFCS: administrators only for now, and the API keeps the veto,
// the maps and every finished map's stats and demos.
const props = defineProps<{
  match: { id: string };
  open: boolean;
}>();

const emit = defineEmits<{ "update:open": [boolean] }>();

const { t } = useI18n();
const nuxtApp = useNuxtApp();

const RESTART_MATCH = gql`
  mutation RestartMatch($matchId: uuid!) {
    restartMatch(match_id: $matchId) {
      success
    }
  }
`;

async function restartMatch() {
  emit("update:open", false);

  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: RESTART_MATCH,
      variables: { matchId: props.match.id },
    });
  } catch (error) {
    toast({
      title: t("match.recovery.restart.failed"),
      description: (error as Error)?.message,
      variant: "destructive",
    });
    return;
  }

  toast({
    title: t("match.recovery.restart.restarted"),
  });
}
</script>

<template>
  <AlertDialog :open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("match.recovery.restart.title")
        }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t("match.recovery.restart.description") }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="emit('update:open', false)">
          {{ $t("common.cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction @click="restartMatch">
          {{ $t("match.recovery.restart.title") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
