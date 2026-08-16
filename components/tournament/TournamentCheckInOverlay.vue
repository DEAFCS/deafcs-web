<script setup lang="ts">
import { ref, computed } from "vue";
import { useSubscription, useApolloClient } from "@vue/apollo-composable";
import gql from "graphql-tag";
import { Button } from "~/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-vue-next";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";

// Forced, non-dismissible overlay for the individual sign-up check-in
// window (match_options.individual_registration_enabled): a player who's
// Registered but hasn't checked in yet gets blocked from the rest of the
// site until they do, no matter what page they're on -- same "reach them
// regardless of page" reasoning as GlobalLobbyCallNotifier, but blocking
// instead of dismissible, since missing this actually costs them their
// slot (ProcessTournamentCheckInExpiry removes no-shows and promotes the
// waitlist in their place).
const me = computed(() => useAuthStore().me);
const steamId = computed(() => me.value?.steam_id ?? null);

const PENDING_CHECK_INS_SUBSCRIPTION = gql`
  subscription MyPendingTournamentCheckIns($steamId: bigint!) {
    tournament_individual_signups(
      where: {
        player_steam_id: { _eq: $steamId }
        status: { _eq: "Registered" }
        checked_in_at: { _is_null: true }
        tournament: { individual_check_in_ends_at: { _is_null: false } }
      }
    ) {
      id
      tournament_id
      tournament {
        id
        name
        individual_check_in_ends_at
      }
    }
  }
`;

const { result } = useSubscription(
  PENDING_CHECK_INS_SUBSCRIPTION,
  () => ({ steamId: steamId.value }),
  () => ({ enabled: !!steamId.value }),
);

// The query can't express "individual_check_in_ends_at > now()" as a
// live-updating filter, so the still-open check is done here instead --
// re-evaluated every tick via the ticking `now` ref below.
const now = ref(Date.now());
setInterval(() => {
  now.value = Date.now();
}, 1000);

const pending = computed(() => {
  const rows = result.value?.tournament_individual_signups ?? [];
  return rows.filter((row: any) => {
    const endsAt = row.tournament?.individual_check_in_ends_at;
    return !!endsAt && new Date(endsAt).getTime() > now.value;
  });
});

// Only ever show one at a time -- vanishingly unlikely a player has two
// simultaneous individual-sign-up check-ins, but if it happens, resolve
// them one at a time rather than stacking overlays.
const current = computed(() => pending.value[0] ?? null);

const secondsLeft = computed(() => {
  if (!current.value) return 0;
  const endsAt = new Date(current.value.tournament.individual_check_in_ends_at).getTime();
  return Math.max(0, Math.ceil((endsAt - now.value) / 1000));
});

const minutesLeft = computed(() => Math.floor(secondsLeft.value / 60));
const secondsRemainder = computed(() => secondsLeft.value % 60);

const { client: apolloClient } = useApolloClient();
const checkingIn = ref(false);

async function checkIn() {
  if (!current.value || checkingIn.value) return;
  checkingIn.value = true;
  try {
    await apolloClient.mutate({
      mutation: generateMutation({
        checkIntoTournament: [
          { tournament_id: current.value.tournament_id },
          { success: true },
        ],
      }),
    });
  } catch (error) {
    toast({
      variant: "destructive",
      title: "Check-in failed",
      description: (error as Error).message,
    });
  } finally {
    checkingIn.value = false;
  }
}
</script>

<template>
  <div
    v-if="current"
    class="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
  >
    <div
      class="w-full max-w-md rounded-xl border border-[hsl(var(--tac-amber))]/50 bg-card p-6 flex flex-col items-center gap-5 text-center"
    >
      <h2 class="text-lg font-semibold">
        {{ $t("tournament.players.check_in.overlay_title") }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{
          $t("tournament.players.check_in.overlay_description", {
            name: current.tournament.name,
          })
        }}
      </p>
      <div class="font-mono text-3xl font-bold tabular-nums text-[hsl(var(--tac-amber))]">
        {{ minutesLeft }}:{{ String(secondsRemainder).padStart(2, "0") }}
      </div>
      <Button size="lg" class="w-full" :disabled="checkingIn" @click="checkIn">
        <Loader2 v-if="checkingIn" class="h-4 w-4 animate-spin" />
        <CheckCircle2 v-else class="h-4 w-4" />
        {{ $t("tournament.players.check_in.check_in_now") }}
      </Button>
    </div>
  </div>
</template>
