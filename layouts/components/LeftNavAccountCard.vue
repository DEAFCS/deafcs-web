<script setup lang="ts">
import { computed, ref, watch } from "vue";
import gql from "graphql-tag";
import { Clock, ShieldCheck } from "lucide-vue-next";
import SteamIcon from "~/components/icons/SteamIcon.vue";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { e_player_roles_enum } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import { loginLinks } from "~/utilities/loginLinks";

// The call to action at the top of the left nav: Sign in with Steam for a
// visitor, then Get Verified (or its status) for a player who has signed in but
// is not verified yet. Nothing for everyone else. Collapsed to a single icon.
defineProps<{ rail: boolean }>();

const authStore = useAuthStore();
const me = computed(() => authStore.me);
const unverified = computed(
  () => !!me.value && !authStore.isRoleAbove(e_player_roles_enum.verified_user),
);

const STATUS_QUERY = gql`
  query LeftNavVerificationStatus($steamId: bigint!) {
    verification_applications(
      where: { player_steam_id: { _eq: $steamId } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      status
    }
  }
`;

const status = ref<string | null>(null);

watch(
  () => [me.value?.steam_id, unverified.value] as const,
  async ([steamId, isUnverified]) => {
    if (!steamId || !isUnverified) return;
    try {
      const { data } = await getGraphqlClient().query({
        query: STATUS_QUERY,
        variables: { steamId },
        fetchPolicy: "network-only",
      });
      status.value = data?.verification_applications?.[0]?.status ?? null;
    } catch {
      // Best-effort: the link falls back to "Get Verified" / /verify.
    }
  },
  { immediate: true },
);

const pending = computed(() => status.value === "pending");
const rejected = computed(() => status.value === "rejected");
const verifyLink = computed(() =>
  pending.value || rejected.value ? "/verify/status" : "/verify",
);

function signIn() {
  window.location.href = `${loginLinks.steam}?redirect=${encodeURIComponent(window.location.toString())}`;
}

const buttonClasses =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[hsl(var(--tac-amber)/0.55)] bg-[hsl(var(--tac-amber)/0.1)] px-3 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-[hsl(var(--tac-amber)/0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))]";
const iconButtonClasses =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[hsl(var(--tac-amber)/0.55)] bg-[hsl(var(--tac-amber)/0.1)] text-sidebar-foreground transition-colors hover:bg-[hsl(var(--tac-amber)/0.22)]";
</script>

<template>
  <div v-if="!me" :class="rail ? 'flex justify-center py-1' : 'px-3 pb-2'">
    <button
      v-if="rail"
      type="button"
      :class="iconButtonClasses"
      :aria-label="$t('layouts.app_nav.account_card.sign_in')"
      :title="$t('layouts.app_nav.account_card.sign_in')"
      @click="signIn"
    >
      <SteamIcon class="h-4 w-4 fill-current" aria-hidden="true" />
    </button>
    <div
      v-else
      class="flex flex-col gap-2 rounded-lg border border-sidebar-border bg-background/40 p-3"
    >
      <p class="text-sm leading-snug text-muted-foreground">
        {{ $t("layouts.app_nav.account_card.guest_line") }}
      </p>
      <button type="button" :class="buttonClasses" @click="signIn">
        <SteamIcon class="h-4 w-4 fill-current" aria-hidden="true" />
        {{ $t("layouts.app_nav.account_card.sign_in") }}
      </button>
    </div>
  </div>

  <div v-else-if="unverified" :class="rail ? 'flex justify-center py-1' : 'px-3 pb-2'">
    <NuxtLink
      v-if="rail"
      :to="verifyLink"
      :class="iconButtonClasses"
      :aria-label="$t('layouts.app_nav.account_card.get_verified')"
      :title="$t('layouts.app_nav.account_card.get_verified')"
    >
      <component :is="pending ? Clock : ShieldCheck" class="h-4 w-4" />
    </NuxtLink>
    <div
      v-else
      class="flex flex-col gap-2 rounded-lg border border-sidebar-border bg-background/40 p-3"
    >
      <p class="text-sm leading-snug text-muted-foreground">
        {{
          pending
            ? $t("layouts.app_nav.account_card.pending_line")
            : rejected
              ? $t("layouts.app_nav.account_card.rejected_line")
              : $t("layouts.app_nav.account_card.verify_line")
        }}
      </p>
      <NuxtLink :to="verifyLink" :class="buttonClasses">
        <component :is="pending ? Clock : ShieldCheck" class="h-4 w-4" />
        {{
          pending
            ? $t("pages.play.matchmaking.verification_pending")
            : rejected
              ? $t("pages.play.matchmaking.verification_rejected")
              : $t("layouts.app_nav.account_card.get_verified")
        }}
      </NuxtLink>
    </div>
  </div>
</template>
