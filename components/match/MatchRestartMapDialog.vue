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

// Restart Map (5stackgg/web #900): back to warmup on the map being played,
// its rounds kept restorable. Shared by the match actions menu and the Rounds
// tab's Fix a Problem menu.
const props = defineProps<{
  match: { id: string };
  open: boolean;
}>();

const emit = defineEmits<{ "update:open": [boolean] }>();

const { t } = useI18n();
const nuxtApp = useNuxtApp();

const RESTART_MATCH_MAP = gql`
  mutation RestartMatchMap($matchId: uuid!) {
    restartMatchMap(match_id: $matchId) {
      success
    }
  }
`;

async function restartMatchMap() {
  emit("update:open", false);

  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: RESTART_MATCH_MAP,
      variables: { matchId: props.match.id },
    });
  } catch (error) {
    toast({
      title: t("match.recovery.restart_map.failed"),
      description: (error as Error)?.message,
      variant: "destructive",
    });
    return;
  }

  toast({
    title: t("match.recovery.restart_map.restarted"),
  });
}
</script>

<template>
  <AlertDialog :open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("match.recovery.restart_map.title")
        }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t("match.recovery.restart_map.description") }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="emit('update:open', false)">
          {{ $t("common.cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction @click="restartMatchMap">
          {{ $t("match.recovery.restart_map.title") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
