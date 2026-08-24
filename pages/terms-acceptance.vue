<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { generateMutation } from "~/graphql/graphqlGen";
import { useAuthStore } from "~/stores/AuthStore";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

definePageMeta({
  layout: "public",
});

const { t } = useI18n();
const route = useRoute();
const apolloClient = useNuxtApp().$apollo.defaultClient;

const agreed = ref(false);
const submitting = ref(false);
const errorMessage = ref("");

function safeRedirectTarget(): string {
  const redirect = route.query.redirect;
  if (typeof redirect !== "string") {
    return "/";
  }
  const decoded = decodeURIComponent(redirect);
  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return decoded;
  }
  return "/";
}

async function acceptAndContinue() {
  if (!agreed.value || submitting.value) {
    return;
  }

  submitting.value = true;
  errorMessage.value = "";

  try {
    await apolloClient.mutate({
      mutation: generateMutation({
        acceptTerms: [{}, { success: true }],
      }),
    });

    // getMe() would short-circuit here and return the still-stale cached
    // value, since hasCheckedSession is already true from initial page
    // load -- it only ever fetches once. fetchMe() forces a real
    // network-only refetch and updates the store's `me` synchronously
    // before it resolves, so the middleware's hasAcceptedCurrentTerms
    // check on the very next navigation is guaranteed current -- not
    // dependent on the live subscription's socket round trip winning a
    // race against navigateTo below.
    await useAuthStore().fetchMe();

    await navigateTo(safeRedirectTarget(), { replace: true });
  } catch (error: any) {
    errorMessage.value = error?.message || t("pages.terms_acceptance.error");
  } finally {
    submitting.value = false;
  }
}

async function logout() {
  await apolloClient.mutate({
    mutation: generateMutation({
      logout: [{}, { success: true }],
    }),
  });
  useAuthStore().clearMe();
  await navigateTo("/", { replace: true });
}
</script>

<template>
  <div
    class="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16"
  >
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{ $t("pages.terms_acceptance.title") }}</CardTitle>
        <CardDescription>{{ $t("pages.terms_acceptance.intro") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-5">
        <div class="flex flex-col gap-2 text-sm">
          <span class="text-muted-foreground">{{
            $t("pages.terms_acceptance.links_label")
          }}</span>
          <div class="flex flex-col gap-1">
            <NuxtLink to="/terms-of-service" class="underline hover:no-underline">
              {{ $t("pages.terms_acceptance.terms_of_service") }}
            </NuxtLink>
            <NuxtLink to="/general-rules" class="underline hover:no-underline">
              {{ $t("pages.terms_acceptance.general_rules") }}
            </NuxtLink>
            <NuxtLink to="/matchmaking-rules" class="underline hover:no-underline">
              {{ $t("pages.terms_acceptance.matchmaking_rules") }}
            </NuxtLink>
            <NuxtLink to="/tournament-rules" class="underline hover:no-underline">
              {{ $t("pages.terms_acceptance.tournament_rules") }}
            </NuxtLink>
          </div>
        </div>

        <label class="flex items-start gap-2 text-sm">
          <Checkbox v-model="agreed" class="mt-0.5" />
          <span>{{ $t("pages.terms_acceptance.checkbox_label") }}</span>
        </label>

        <i18n-t
          keypath="pages.terms_acceptance.privacy_notice"
          tag="p"
          scope="global"
          class="text-xs text-muted-foreground"
        >
          <template #privacy_policy>
            <NuxtLink to="/privacy-policy" class="underline hover:no-underline">
              {{ $t("pages.terms_acceptance.privacy_policy") }}
            </NuxtLink>
          </template>
        </i18n-t>

        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>

        <Button :disabled="!agreed || submitting" @click="acceptAndContinue">
          {{
            submitting
              ? $t("pages.terms_acceptance.accepting")
              : $t("pages.terms_acceptance.accept_button")
          }}
        </Button>

        <button
          type="button"
          class="text-xs text-muted-foreground underline hover:no-underline"
          @click="logout"
        >
          {{ $t("pages.terms_acceptance.logout") }}
        </button>
      </CardContent>
    </Card>
  </div>
</template>
