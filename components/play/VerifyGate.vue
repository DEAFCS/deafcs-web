<script setup lang="ts">
import { computed, ref, watch } from "vue";
import gql from "graphql-tag";
import { Clock, Lock, ShieldCheck } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { useAuthStore } from "~/stores/AuthStore";

// Blurs and disables whatever it wraps while `locked`, with the verification
// call to action centred over it -- the same treatment the matchmaking picker
// gives a player who is not verified yet.
const props = withDefaults(defineProps<{ locked: boolean; message?: string }>(), {
  message: "",
});

const me = computed(() => useAuthStore().me);

const STATUS_QUERY = gql`
  query MyVerificationStatusForGate($steamId: bigint!) {
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
  () => [me.value?.steam_id, props.locked] as const,
  async ([steamId, locked]) => {
    if (!steamId || !locked) return;
    try {
      const { data } = await getGraphqlClient().query({
        query: STATUS_QUERY,
        variables: { steamId },
        fetchPolicy: "network-only",
      });
      status.value = data?.verification_applications?.[0]?.status ?? null;
    } catch {
      // Best-effort: the link just falls back to "Get Verified" / /verify.
    }
  },
  { immediate: true },
);

const pending = computed(() => status.value === "pending");
const link = computed(() =>
  pending.value || status.value === "rejected" ? "/verify/status" : "/verify",
);
</script>

<template>
  <div class="relative">
    <div
      :class="locked && 'pointer-events-none select-none opacity-60 blur-[6px]'"
      :inert="locked"
      :aria-hidden="locked ? 'true' : undefined"
    >
      <slot />
    </div>
    <div
      v-if="locked"
      class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 p-3 text-center"
    >
      <Lock class="size-5 text-muted-foreground" />
      <span class="text-[13px] font-semibold">
        {{ message || $t("pages.play.matchmaking.verification_required") }}
      </span>
      <Button
        as-child
        size="sm"
        :class="
          pending
            ? 'bg-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber-foreground))] hover:bg-[hsl(var(--tac-amber)/0.9)]'
            : 'bg-emerald-600 text-white hover:bg-emerald-500'
        "
      >
        <NuxtLink :to="link">
          <component :is="pending ? Clock : ShieldCheck" class="size-3.5" />
          {{
            pending
              ? $t("pages.play.matchmaking.verification_pending")
              : $t("pages.play.matchmaking.get_verified")
          }}
        </NuxtLink>
      </Button>
    </div>
  </div>
</template>
