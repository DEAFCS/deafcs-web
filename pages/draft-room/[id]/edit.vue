<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { $, e_player_roles_enum } from "~/generated/zeus";
import { matchOptionsFields } from "~/graphql/matchOptionsFields";
import { useAuthStore } from "~/stores/AuthStore";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import CreateDraftGame from "~/components/draft-games/CreateDraftGame.vue";

definePageMeta({
  middleware: ["draft-create"],
});

const route = useRoute();
const draftGame = ref<any | undefined>(undefined);

onMounted(async () => {
  // elo_enabled is invisible at the API level to everyone below match
  // organizer — requesting it for a plain host's own draft would fail the
  // whole query (Hasura rejects unrecognized-for-role fields outright).
  const canManageElo = useAuthStore().isRoleAbove(
    e_player_roles_enum.match_organizer,
  );
  const { data } = await getGraphqlClient().query({
    query: generateQuery({
      draft_games_by_pk: [
        { id: $("id", "uuid!") },
        {
          id: true,
          host_steam_id: true,
          is_organizer: true,
          status: true,
          mode: true,
          access: true,
          type: true,
          regions: true,
          map_pool_id: true,
          team_1_id: true,
          team_2_id: true,
          captain_selection: true,
          draft_order: true,
          require_approval: true,
          min_elo: true,
          max_elo: true,
          ...(canManageElo ? { elo_enabled: true } : {}),
          options: {
            ...matchOptionsFields,
          },
        },
      ],
    }),
    variables: {
      id: route.params.id,
    },
  });

  if (
    !data.draft_games_by_pk ||
    !data.draft_games_by_pk.is_organizer ||
    data.draft_games_by_pk.status !== "Open"
  ) {
    navigateTo(`/draft-room/${route.params.id}`);
    return;
  }

  draftGame.value = data.draft_games_by_pk;
});

const onSaved = () => {
  navigateTo(`/draft-room/${route.params.id}`);
};
</script>

<template>
  <PageTransition>
    <div class="mx-auto max-w-3xl pb-24">
      <TacticalPageHeader>
        <template #title>{{ $t("draft_games.room.edit_settings") }}</template>
      </TacticalPageHeader>
      <CreateDraftGame
        v-if="draftGame"
        :initial="draftGame"
        :editing="true"
        class="mt-4"
        @created="onSaved"
      />
    </div>
  </PageTransition>
</template>
