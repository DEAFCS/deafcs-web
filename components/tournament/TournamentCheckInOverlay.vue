<script setup lang="ts">
import { ref, computed } from "vue";
import { useSubscription, useApolloClient } from "@vue/apollo-composable";
import gql from "graphql-tag";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Loader2, X } from "lucide-vue-next";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";

// Tournament attendance prompt for the individual sign-up check-in window: a
// player who is Registered but has not checked in yet gets prompted wherever
// they are on the site, same "reach them regardless of page" reasoning as
// GlobalLobbyCallNotifier.
//
// Visual shell is deliberately identical to MatchActiveAlert (the match ready
// popup): same framed panel, amber hairline + glow, corner accents, scanlines,
// and top-right X. That component is approved and in production, so it is left
// completely untouched and the shell is mirrored here rather than extracted --
// a shared component would have meant editing MatchActiveAlert's markup, and
// nothing about this change is worth risking a regression in the match popup.
// solo-random-attendance-polish.test.mjs asserts the two shells stay identical
// so they cannot silently drift.
//
// Two deliberate differences from the match popup, both required:
//   * No "disable this popup" footer. Attendance is not a preference-driven
//     nag; missing it costs the player their slot.
//   * The action button stays white (the default variant), not the amber CTA.
//     White reads as "confirm, right here"; amber is reserved for navigating
//     somewhere, which is what GO TO MATCH does.
const me = computed(() => useAuthStore().me);
const steamId = computed(() => me.value?.steam_id ?? null);

const PENDING_CHECK_INS_SUBSCRIPTION = gql`
  subscription MyPendingTournamentCheckIns($steamId: bigint!) {
    tournament_individual_signups(
      where: {
        player_steam_id: { _eq: $steamId }
        status: { _eq: Registered }
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

// Dismissed windows, keyed by signup id + window end so a genuinely new
// window (the scheduler re-opens one after promoting from the waitlist)
// prompts again rather than staying silent.
const dismissedKeys = ref<Set<string>>(new Set());
const currentKey = computed(() =>
  current.value
    ? `${current.value.id}:${current.value.tournament?.individual_check_in_ends_at}`
    : null,
);

const open = computed(
  () => !!current.value && !dismissedKeys.value.has(currentKey.value as string),
);

// Dismiss only closes the prompt. It never checks the player in and never
// leaves the tournament -- they can still check in from the tournament's
// Players page for as long as the window is open.
function dismiss() {
  if (!currentKey.value) return;
  const next = new Set(dismissedKeys.value);
  next.add(currentKey.value);
  dismissedKeys.value = next;
}

const secondsLeft = computed(() => {
  if (!current.value) return 0;
  const endsAt = new Date(
    current.value.tournament.individual_check_in_ends_at,
  ).getTime();
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
    // The subscription drops this row once checked_in_at is set, which closes
    // the prompt on its own.
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
  <AlertDialog :open="open">
    <AlertDialogContent
      class="!max-w-md !gap-0 overflow-visible !border-0 !bg-transparent !p-0 !shadow-none"
      @escape-key-down="dismiss"
    >
      <div
        v-if="current"
        class="relative overflow-hidden rounded-lg border border-border px-6 py-8 [backdrop-filter:blur(10px)] [background:linear-gradient(180deg,hsl(var(--card)/0.95)_0%,hsl(var(--card)/0.85)_100%)] [box-shadow:0_0_0_1px_hsl(var(--tac-amber)/0.3),0_0_40px_hsl(var(--tac-amber)/0.18)]"
      >
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-2 top-2 h-[14px] w-[14px] border-l-2 border-t-2 border-[hsl(var(--tac-amber))]"
        ></span>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute bottom-2 right-2 h-[14px] w-[14px] border-b-2 border-r-2 border-[hsl(var(--tac-amber))]"
        ></span>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(180deg,transparent_0,transparent_3px,hsl(var(--tac-amber)/0.04)_3px,hsl(var(--tac-amber)/0.04)_4px)]"
        ></span>

        <div class="relative z-10 flex flex-col items-center gap-5 text-center">
          <div class="flex flex-col items-center gap-1.5">
            <div
              class="inline-flex items-center gap-2 font-mono text-[0.72rem] font-bold uppercase tracking-[0.28em] text-[hsl(var(--tac-amber))]"
            >
              <span
                class="inline-block h-[2px] w-[10px] bg-[hsl(var(--tac-amber))]"
              ></span>
              {{ $t("tournament.players.check_in.overlay_title") }}
              <span
                class="h-1 w-1 rounded-full animate-soft-pulse bg-[hsl(var(--tac-amber))]"
              ></span>
            </div>
          </div>

          <div class="flex flex-col items-center gap-1">
            <div
              class="font-sans text-base font-semibold leading-snug text-foreground"
            >
              {{ current.tournament.name }}
            </div>
          </div>

          <div
            class="font-mono text-3xl font-bold tabular-nums text-[hsl(var(--tac-amber))]"
          >
            {{ minutesLeft }}:{{ String(secondsRemainder).padStart(2, "0") }}
          </div>

          <button
            type="button"
            class="relative isolate inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-md border border-input bg-background px-6 py-4 font-sans text-sm font-bold uppercase leading-none tracking-[0.22em] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            :disabled="checkingIn"
            @click="checkIn"
          >
            <Loader2 v-if="checkingIn" class="h-4 w-4 animate-spin" />
            {{ $t("tournament.players.check_in.check_in_now") }}
          </button>
        </div>

        <button
          type="button"
          class="absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          :aria-label="$t('common.close')"
          @click="dismiss"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </AlertDialogContent>
  </AlertDialog>
</template>
