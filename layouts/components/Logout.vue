<script setup lang="ts"></script>

<template>
  <AlertDialog :open="true" @update:open="(open) => $emit('update:open', open)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("layouts.app_nav.logout_dialog.title")
        }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t("layouts.app_nav.logout_dialog.description") }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t("common.cancel") }}</AlertDialogCancel>
        <AlertDialogAction @click="logout">{{
          $t("layouts.app_nav.logout_dialog.confirm")
        }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import { useAuthStore } from "~/stores/AuthStore";

export default {
  methods: {
    async logout() {
      await this.$apollo.mutate({
        mutation: generateMutation({
          logout: [
            {},
            {
              success: true,
            },
          ],
        }),
      });

      useAuthStore().clearMe();

      // Return through the router so the landing gate can react to the
      // cleared session without restarting the entire application.
      await navigateTo("/", { replace: true });
    },
  },
};
</script>
