<script setup lang="ts">
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import SettingsPage from "~/components/settings/SettingsPage.vue";
import SettingsSection from "~/components/settings/SettingsSection.vue";
import PlayerSearch from "~/components/PlayerSearch.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-vue-next";
</script>

<template>
  <SettingsPage>
    <PageTransition :delay="0">
      <SettingsSection
        id="api-keys"
        :title="$t('pages.settings.application.api_keys.title')"
        :description="
          $t('pages.settings.application.api_keys.description')
        "
      >
        <div class="max-w-md">
          <PlayerSearch
            :label="$t('pages.settings.application.api_keys.grant_label')"
            :exclude="grantedSteamIds"
            @selected="grantAccess"
          />
        </div>

        <div v-if="loading" class="text-sm text-muted-foreground">
          {{ $t("common.loading") }}
        </div>
        <div
          v-else-if="grantedPlayers.length === 0"
          class="text-sm text-muted-foreground"
        >
          {{ $t("pages.settings.application.api_keys.none_granted") }}
        </div>
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="player in grantedPlayers"
            :key="player.steam_id"
            class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3"
          >
            <PlayerDisplay :player="player" :show-elo="false" linkable />
            <Button
              variant="ghost"
              size="icon"
              class="text-destructive hover:text-destructive"
              :disabled="revoking === player.steam_id"
              @click="revokeAccess(player)"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SettingsSection>
    </PageTransition>
  </SettingsPage>
</template>

<script lang="ts">
import { generateMutation, generateQuery } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";

export default {
  data() {
    return {
      grantedPlayers: [] as any[],
      loading: true,
      revoking: null as string | null,
    };
  },
  computed: {
    grantedSteamIds(): string[] {
      return this.grantedPlayers.map((p) => p.steam_id);
    },
  },
  mounted() {
    return this.fetchGranted();
  },
  methods: {
    async fetchGranted() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          query: generateQuery({
            players: [
              {
                where: { api_key_enabled: { _eq: true } },
                order_by: [{ name: "asc" as any }],
              },
              {
                steam_id: true,
                name: true,
                avatar_url: true,
                custom_avatar_url: true,
                country: true,
                role: true,
              },
            ],
          }),
          fetchPolicy: "network-only",
        });
        this.grantedPlayers = data?.players ?? [];
      } finally {
        this.loading = false;
      }
    },
    async grantAccess(player: any) {
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation({
            update_players_by_pk: [
              {
                pk_columns: { steam_id: player.steam_id },
                _set: { api_key_enabled: true },
              },
              { steam_id: true },
            ],
          }),
        });
        toast({
          title: this.$t(
            "pages.settings.application.api_keys.granted",
            { name: player.name },
          ),
        });
        await this.fetchGranted();
      } catch (error) {
        toast({
          title: this.$t("pages.settings.application.api_keys.grant_failed"),
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    },
    async revokeAccess(player: any) {
      if (this.revoking) {
        return;
      }
      this.revoking = player.steam_id;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation({
            update_players_by_pk: [
              {
                pk_columns: { steam_id: player.steam_id },
                _set: { api_key_enabled: false },
              },
              { steam_id: true },
            ],
          }),
        });
        this.grantedPlayers = this.grantedPlayers.filter(
          (p) => p.steam_id !== player.steam_id,
        );
      } catch (error) {
        toast({
          title: this.$t("pages.settings.application.api_keys.revoke_failed"),
          description: (error as Error).message,
          variant: "destructive",
        });
      } finally {
        this.revoking = null;
      }
    },
  },
};
</script>
