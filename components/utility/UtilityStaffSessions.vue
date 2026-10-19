<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Server } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { toast } from "~/components/ui/toast";
import TimeAgo from "~/components/TimeAgo.vue";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import {
  staffUtilityPracticeSessionsSubscription,
  stopUtilityPracticeMutation,
} from "~/graphql/utilityGraphql";
import cleanMapName from "~/utilities/cleanMapName";

// Administrators only: who is running a practice server right now, and a way
// to stop one. The mount site decides who sees it; Hasura only returns other
// players' sessions to an administrator in any case.
type StaffSession = {
  id: string;
  status: string;
  map_name: string;
  region: string | null;
  access: string | null;
  created_at: string;
  host: { steam_id: string; name: string } | null;
};

const { t } = useI18n();
const sessions = ref<StaffSession[]>([]);
const stopping = ref<string | null>(null);
let sub: { unsubscribe: () => void } | null = null;

onMounted(() => {
  sub = getGraphqlClient()
    .subscribe({
      query: staffUtilityPracticeSessionsSubscription,
      variables: { statuses: ["Starting", "Ready"] },
    })
    .subscribe({
      next: ({ data }: { data: any }) => {
        sessions.value = data?.utility_practice_sessions ?? [];
      },
      error: (error: unknown) => {
        console.error("[utility] staff sessions subscription error:", error);
      },
    });
});

onBeforeUnmount(() => sub?.unsubscribe());

const count = computed(() => sessions.value.length);

async function stop(session: StaffSession) {
  stopping.value = session.id;
  try {
    await getGraphqlClient().mutate({
      mutation: stopUtilityPracticeMutation,
      variables: { session_id: session.id },
    });
  } catch (error: any) {
    toast({
      title: t("pages.utility.practice.stop_failed"),
      description: error?.message,
      variant: "destructive",
    });
  } finally {
    stopping.value = null;
  }
}
</script>

<template>
  <section
    class="rounded-[10px] border border-border bg-muted/20 p-3.5 lg:self-start"
    data-testid="utility-staff-sessions"
  >
    <header class="mb-2.5 flex items-center gap-2">
      <Server class="size-3.5 text-muted-foreground" />
      <h2
        class="font-mono text-[0.68rem] font-bold uppercase tracking-[0.16em]"
      >
        {{ $t("pages.utility.staff.title") }}
      </h2>
      <span class="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
        {{ count }}
      </span>
    </header>

    <p v-if="!count" class="text-xs text-muted-foreground">
      {{ $t("pages.utility.staff.empty") }}
    </p>

    <ul v-else class="grid gap-2">
      <li
        v-for="session of sessions"
        :key="session.id"
        class="flex items-center gap-2.5 rounded-md border border-border/70 bg-card/50 px-2.5 py-2"
      >
        <div class="min-w-0 flex-1">
          <NuxtLink
            v-if="session.host"
            :to="`/players/${session.host.steam_id}`"
            class="block truncate text-[13px] font-semibold hover:underline"
          >
            {{ session.host.name }}
          </NuxtLink>
          <div class="truncate text-xs text-muted-foreground">
            {{ cleanMapName(session.map_name) }}
            <template v-if="session.region"> · {{ session.region }}</template>
            · {{ session.status }} ·
            <TimeAgo :date="session.created_at" hide-icon />
          </div>
        </div>
        <Button
          size="sm"
          variant="destructive"
          class="h-7 shrink-0"
          :disabled="stopping === session.id"
          @click="stop(session)"
        >
          {{ $t("pages.utility.staff.stop") }}
        </Button>
      </li>
    </ul>
  </section>
</template>
