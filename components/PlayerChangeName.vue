<script setup lang="ts">
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
</script>

<template>
  <div v-if="canChangeName" class="space-y-1.5">
    <form class="flex items-center gap-2" @submit.prevent="save">
      <Input
        v-model="name"
        maxlength="32"
        :placeholder="$t('player.change_name.name_label')"
        class="flex-1 min-w-0"
      />
      <Button
        variant="tactical"
        type="submit"
        size="sm"
        :loading="saving"
        :disabled="saving || !isValid || name === player.name"
      >
        <Spinner v-if="saving" class="mr-1 h-4 w-4" />
        {{ $t("common.save") }}
      </Button>
    </form>
    <p v-if="mustRequestNameChange" class="text-xs text-muted-foreground">
      {{ $t("player.change_name.approval_hint") }}
    </p>

    <AlertDialog :open="showRequestedDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("player.change_name.requested_title")
          }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t("player.change_name.requested_description") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="showRequestedDialog = false">
            {{ $t("common.ok") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import { $ } from "~/generated/zeus";
import { toast } from "@/components/ui/toast";
import { e_player_roles_enum } from "~/generated/zeus";

export default {
  inheritAttrs: false,
  props: {
    player: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      name: "",
      saving: false,
      showRequestedDialog: false,
    };
  },
  watch: {
    player: {
      immediate: true,
      handler(player) {
        if (player) this.name = player.name;
      },
    },
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
    canChangeName() {
      return (
        this.player?.steam_id === this.me?.steam_id ||
        useAuthStore().isRoleAbove(e_player_roles_enum.administrator)
      );
    },
    mustRequestNameChange() {
      return !useAuthStore().isRoleAbove(e_player_roles_enum.administrator);
    },
    isValid() {
      const trimmed = (this.name || "").trim();
      return (
        trimmed.length >= 3 &&
        trimmed.length <= 32 &&
        /^[A-Za-z0-9_-]+$/.test(trimmed)
      );
    },
  },
  methods: {
    async save() {
      if (!this.isValid || this.saving) return;
      this.saving = true;
      try {
        if (this.mustRequestNameChange) {
          await this.$apollo.mutate({
            variables: { player_name: this.name },
            mutation: generateMutation({
              requestNameChange: [
                {
                  steam_id: this.player.steam_id,
                  name: $("player_name", "String!"),
                },
                { success: true },
              ],
            }),
          });
          this.showRequestedDialog = true;
        } else {
          await this.$apollo.mutate({
            variables: { player_name: this.name },
            mutation: generateMutation({
              update_players_by_pk: [
                {
                  pk_columns: { steam_id: this.player.steam_id },
                  _set: { name: $("player_name", "String!") },
                },
                { steam_id: true },
              ],
            }),
          });
          toast({ title: this.$t("player.change_name.success") });
        }
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>
