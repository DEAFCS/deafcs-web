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
        :disabled="saving || !isValid || name === player.name || nameTaken"
      >
        <Spinner v-if="saving" class="mr-1 h-4 w-4" />
        {{ $t("common.save") }}
      </Button>
    </form>
    <p v-if="nameTaken" class="text-xs text-destructive" role="alert">
      {{ $t("player.name_taken", PLAYER_NAME_TAKEN_FALLBACK) }}
    </p>
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
import {
  isNameTakenError,
  isPlayerNameAvailable,
  PLAYER_NAME_TAKEN_FALLBACK,
} from "~/utilities/isPlayerNameAvailable";

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
      nameTaken: false,
      nameCheckId: 0,
      nameCheckTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      PLAYER_NAME_TAKEN_FALLBACK,
    };
  },
  beforeUnmount() {
    clearTimeout(this.nameCheckTimer);
  },
  watch: {
    player: {
      immediate: true,
      handler(player) {
        if (player) this.name = player.name;
      },
    },
    // Live "already taken" feedback while typing -- only for a name that
    // passes the format rule and differs from the player's current one.
    name() {
      clearTimeout(this.nameCheckTimer);
      this.nameTaken = false;
      this.nameCheckId++;
      if (!this.isValid || this.name === this.player?.name) return;
      this.nameCheckTimer = setTimeout(() => this.refreshNameTaken(), 300);
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
    async refreshNameTaken() {
      const checkId = ++this.nameCheckId;
      const available = await isPlayerNameAvailable(
        this.$apollo,
        this.name.trim(),
        this.player.steam_id,
      );
      // A newer keystroke superseded this lookup.
      if (checkId === this.nameCheckId) this.nameTaken = !available;
    },
    async save() {
      if (!this.isValid || this.saving) return;
      this.saving = true;
      try {
        // Authoritative check right before submitting, so a name that was
        // taken after the last keystroke is stopped here rather than only
        // by the API's rejection.
        if (
          !(await isPlayerNameAvailable(
            this.$apollo,
            this.name.trim(),
            this.player.steam_id,
          ))
        ) {
          this.nameTaken = true;
          return;
        }

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
      } catch (error) {
        // Lost a race with another player (API check or unique index):
        // show it inline like the live check does instead of a bare error.
        if (isNameTakenError(error)) {
          this.nameTaken = true;
        } else {
          throw error;
        }
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>
