<script setup lang="ts">
import { watch, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Switch } from "~/components/ui/switch";
import { FormSection } from "~/components/ui/form";
import { toast } from "~/components/ui/toast";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import {
  MY_MESSAGE_REQUESTS_SETTING_QUERY,
  SET_MESSAGE_REQUESTS_SETTING_MUTATION,
} from "~/graphql/messageRequests";
const { t } = useI18n();
// Who besides friends may start a conversation. Null until it loads, or when
// the api has not migrated yet -- the switch stays disabled rather than
// claiming a setting it cannot read.
const allowMessageRequests = ref<boolean | null>(null);
const savingMessageRequests = ref(false);

const authStore = useAuthStore();
let generation = 0;
onUnmounted(() => generation++);
watch(
  () => authStore.me?.steam_id,
  async (steamId) => {
    const current = ++generation;
    allowMessageRequests.value = null;
    savingMessageRequests.value = false;

    if (!steamId) {
      return;
    }

    try {
      const { data } = await getGraphqlClient().query({
        query: MY_MESSAGE_REQUESTS_SETTING_QUERY,
        variables: { steamId },
        fetchPolicy: "network-only",
        context: { optional: true },
      });

      if (current !== generation || authStore.me?.steam_id !== steamId) return;
      allowMessageRequests.value =
        typeof data?.players_by_pk?.allow_message_requests === "boolean"
          ? data.players_by_pk.allow_message_requests
          : null;
    } catch {
      if (current === generation) allowMessageRequests.value = null;
    }
  },
  { immediate: true },
);

async function setMessageRequests(allow: boolean) {
  const steamId = useAuthStore().me?.steam_id;

  if (
    !steamId ||
    allowMessageRequests.value === null ||
    savingMessageRequests.value
  )
    return;
  const current = generation;
  const previous = allowMessageRequests.value;
  allowMessageRequests.value = allow;
  savingMessageRequests.value = true;

  try {
    const { data } = await getGraphqlClient().mutate({
      mutation: SET_MESSAGE_REQUESTS_SETTING_MUTATION,
      variables: { steamId, allow },
    });

    if (current !== generation || authStore.me?.steam_id !== steamId) return;
    const saved = data?.update_players_by_pk;
    if (
      String(saved?.steam_id) !== String(steamId) ||
      saved.allow_message_requests !== allow
    )
      throw new Error("setting not saved");
    toast({
      title: t("pages.settings.blocked_players.message_requests.updated"),
    });
  } catch {
    if (current !== generation) return;
    allowMessageRequests.value = previous;
    toast({
      title: t("pages.settings.blocked_players.message_requests.update_failed"),
      variant: "destructive",
    });
  } finally {
    if (current === generation) savingMessageRequests.value = false;
  }
}
</script>
<template>
  <FormSection
    :title="$t('pages.settings.blocked_players.message_requests.title')"
  >
    <div class="flex items-center gap-4">
      <p class="min-w-0 max-w-prose flex-1 text-sm text-muted-foreground">
        {{ $t("pages.settings.blocked_players.message_requests.description") }}
      </p>
      <Switch
        class="shrink-0"
        :aria-label="
          $t('pages.settings.blocked_players.message_requests.title')
        "
        :model-value="allowMessageRequests === true"
        :disabled="allowMessageRequests === null || savingMessageRequests"
        @update:model-value="setMessageRequests"
      />
    </div>
  </FormSection>
</template>
