<script setup lang="ts">
import { computed, ref, watch } from "vue";
import gql from "graphql-tag";
import { ArrowLeft, Calculator, CheckCircle2, Crown, ShieldAlert, XCircle } from "lucide-vue-next";
import BackToLink from "~/components/common/BackToLink.vue";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { useAuthStore } from "~/stores/AuthStore";
import { dateLocale } from "~/utilities/dateLocale";

// Player of the Month staff review (administrators). The API calculates the
// candidates with their evidence; nothing is awarded until an administrator
// approves a candidate here. Approving creates the month's award (shown on
// the homepage and in the player's award history); rejecting closes the
// month without a winner. Every step is kept in the audit trail.

useHead({ title: "Player of the Month review" });

const auth = useAuthStore();
const isAdministrator = computed(() => auth.me?.role === "administrator");

const REVIEW_FIELDS = `
  month status rules_version rules candidates calculated_at calculated_by_steam_id
  winner_steam_id occurrence_id decided_by_steam_id decided_at decision_note events
`;
const REVIEW_QUERY = gql`query PlayerOfTheMonthReview($month: String!) { playerOfTheMonthReview(month: $month) { ${REVIEW_FIELDS} } }`;
const CALCULATE = gql`mutation CalculatePlayerOfTheMonth($month: String!) { calculatePlayerOfTheMonth(month: $month) { ${REVIEW_FIELDS} } }`;
const APPROVE = gql`mutation ApprovePlayerOfTheMonth($month: String!, $player: String!, $note: String) { approvePlayerOfTheMonth(month: $month, player_steam_id: $player, note: $note) { ${REVIEW_FIELDS} } }`;
const REJECT = gql`mutation RejectPlayerOfTheMonth($month: String!, $note: String!) { rejectPlayerOfTheMonth(month: $month, note: $note) { ${REVIEW_FIELDS} } }`;

// The last 12 finished months (UTC), newest first.
const months = computed(() => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    return {
      key,
      label: d.toLocaleDateString(dateLocale(), { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
});
const month = ref(months.value[0].key);

const review = ref<any | null>(null);
const loading = ref(false);
const busy = ref(false);
const confirmFor = ref<string | null>(null);
const approveNote = ref("");
const rejectOpen = ref(false);
const rejectNote = ref("");

const errorText = (error: any) =>
  error?.graphQLErrors?.[0]?.message ?? error?.message ?? "Something went wrong";

async function run(document: any, variables: Record<string, unknown>, mutation = false) {
  const client = getGraphqlClient();
  const { data } = mutation
    ? await client.mutate({ mutation: document, variables })
    : await client.query({ query: document, variables, fetchPolicy: "network-only" });
  return Object.values(data as Record<string, unknown>)[0] ?? null;
}

async function load() {
  if (!isAdministrator.value) return;
  loading.value = true;
  try {
    review.value = await run(REVIEW_QUERY, { month: month.value });
  } catch (error) {
    review.value = null;
    toast({ title: "Could not load the review", description: errorText(error), variant: "destructive" });
  } finally {
    loading.value = false;
  }
}

async function act(fn: () => Promise<unknown>, success: string) {
  busy.value = true;
  try {
    review.value = await fn();
    toast({ title: success });
    confirmFor.value = null;
    rejectOpen.value = false;
    approveNote.value = "";
    rejectNote.value = "";
  } catch (error) {
    toast({ title: "Not done", description: errorText(error), variant: "destructive" });
  } finally {
    busy.value = false;
  }
}

const calculate = () => act(() => run(CALCULATE, { month: month.value }, true), "Candidates calculated");
const approve = (steamId: string) =>
  act(
    () => run(APPROVE, { month: month.value, player: steamId, note: approveNote.value.trim() || null }, true),
    "Player of the Month awarded",
  );
const reject = () =>
  act(() => run(REJECT, { month: month.value, note: rejectNote.value.trim() }, true), "Month closed without a winner");

watch([month, isAdministrator], () => void load(), { immediate: true });

const snapshot = computed(() => review.value?.candidates ?? null);
const candidates = computed<any[]>(() => snapshot.value?.candidates ?? []);
const pending = computed(() => review.value?.status === "pending");
const nameOf = (steamId: string | null) =>
  candidates.value.find((c) => c.steamId === steamId)?.name ?? steamId ?? "";
const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" }) : "";
const typeSummary = (byType: Record<string, number>) =>
  Object.entries(byType ?? {})
    .map(([type, n]) => `${n} ${type}`)
    .join(" · ");
const statusClasses: Record<string, string> = {
  pending: "border-[hsl(var(--tac-amber)/0.5)] bg-[hsl(var(--tac-amber)/0.12)] text-[hsl(var(--tac-amber))]",
  approved: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  rejected: "border-destructive/50 bg-destructive/10 text-destructive",
};
</script>

<template>
  <main class="space-y-5 py-6">
    <PageTransition>
      <div class="space-y-5">
        <BackToLink
          to="/awards"
          class="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
          Back to Awards
        </BackToLink>

        <TacticalPageHeader>
          <template #title>Player of the Month</template>
          <template #subtitle>
            Staff review. Candidates are calculated from completed DEAFCS matches in the month (UTC);
            nothing is awarded until an administrator approves a winner.
          </template>
        </TacticalPageHeader>

        <p
          v-if="!isAdministrator"
          class="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
          data-testid="potm-admin-only"
        >
          Only administrators can review Player of the Month.
        </p>

        <template v-else>
          <section class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <Select v-model="month">
              <SelectTrigger class="h-9 w-52" aria-label="Award month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="m in months" :key="m.key" :value="m.key">{{ m.label }}</SelectItem>
              </SelectContent>
            </Select>
            <span
              v-if="review"
              class="rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize"
              :class="statusClasses[review.status]"
              data-testid="potm-status"
            >{{ review.status }}</span>
            <span v-else-if="!loading" class="text-xs text-muted-foreground">Not calculated yet</span>
            <div class="ml-auto flex flex-wrap gap-2">
              <Button
                v-if="!review || review.status !== 'approved'"
                type="button"
                variant="outline"
                size="sm"
                :disabled="busy || loading"
                data-testid="potm-calculate"
                @click="calculate"
              >
                <Calculator class="mr-1.5 size-4" aria-hidden="true" />
                {{ review ? "Recalculate" : "Calculate candidates" }}
              </Button>
              <Button
                v-if="pending"
                type="button"
                variant="outline"
                size="sm"
                class="border-destructive/50 text-destructive hover:bg-destructive/10"
                :disabled="busy"
                @click="rejectOpen = !rejectOpen"
              >
                <XCircle class="mr-1.5 size-4" aria-hidden="true" />
                No winner this month
              </Button>
            </div>
          </section>

          <section v-if="rejectOpen" class="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <label class="text-sm font-semibold" for="potm-reject-note">Reason (kept in the audit trail)</label>
            <Textarea id="potm-reject-note" v-model="rejectNote" rows="2" />
            <Button type="button" size="sm" variant="destructive" :disabled="busy || !rejectNote.trim()" @click="reject">
              Close the month without a winner
            </Button>
          </section>

          <section
            v-if="review?.status === 'approved'"
            class="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm"
          >
            <Crown class="size-5 shrink-0 text-[hsl(var(--tac-amber))]" aria-hidden="true" />
            <span>
              Awarded to <b>{{ nameOf(review.winner_steam_id) }}</b> on {{ formatTime(review.decided_at) }}.
              <template v-if="review.decision_note"> Note: {{ review.decision_note }}</template>
            </span>
          </section>
          <section
            v-else-if="review?.status === 'rejected'"
            class="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            Closed without a winner on {{ formatTime(review.decided_at) }}: {{ review.decision_note }}
          </section>

          <div v-if="loading" class="h-40 animate-pulse rounded-lg bg-muted/30"></div>

          <section v-else-if="snapshot" class="space-y-3" data-testid="potm-candidates">
            <p class="text-xs text-muted-foreground">
              Calculated {{ formatTime(review.calculated_at) }} with rules v{{ review.rules_version }}
              from {{ snapshot.totalMatchesConsidered }} finished matches. Listed: the top eligible
              candidates, plus anyone ranked above them who is not eligible (with the reason).
            </p>
            <p v-if="!candidates.length" class="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No player had a counted match this month.
            </p>

            <article
              v-for="c in candidates"
              :key="c.steamId"
              class="rounded-lg border p-3"
              :class="
                c.steamId === review.winner_steam_id
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : c.eligible
                    ? c.steamId === snapshot.recommendedSteamId
                      ? 'border-[hsl(var(--tac-amber)/0.6)] bg-[hsl(var(--tac-amber)/0.06)]'
                      : 'border-border bg-muted/15'
                    : 'border-destructive/40 bg-destructive/5'
              "
              :data-testid="`potm-candidate-${c.steamId}`"
            >
              <div class="flex flex-wrap items-center gap-3">
                <span class="w-6 text-center font-mono text-sm font-bold text-muted-foreground">{{ c.rank }}</span>
                <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" class="size-9 rounded-md object-cover" loading="lazy" />
                <div class="min-w-0 flex-1">
                  <NuxtLink :to="`/players/${c.steamId}`" class="font-bold hover:text-[hsl(var(--tac-amber))]">{{ c.name }}</NuxtLink>
                  <p class="text-xs text-muted-foreground">
                    <b class="text-foreground">{{ c.eligibleMatches }}</b> counted matches ({{ typeSummary(c.byType) }}),
                    {{ c.tournamentMatches }} tournament, {{ c.roundsPlayed }} rounds
                  </p>
                </div>
                <span v-if="c.steamId === snapshot.recommendedSteamId && c.eligible" class="text-xs font-semibold text-[hsl(var(--tac-amber))]">
                  Recommended
                </span>
                <span v-if="c.tiedWithNext" class="rounded border border-[hsl(var(--tac-amber)/0.5)] px-1.5 text-[11px] font-semibold text-[hsl(var(--tac-amber))]">
                  Tie: staff decide
                </span>
                <Button
                  v-if="pending && c.eligible && confirmFor !== c.steamId"
                  type="button"
                  size="sm"
                  :disabled="busy"
                  :data-testid="`potm-approve-${c.steamId}`"
                  @click="confirmFor = c.steamId"
                >
                  <CheckCircle2 class="mr-1.5 size-4" aria-hidden="true" />
                  Approve
                </Button>
              </div>

              <div v-if="confirmFor === c.steamId" class="mt-3 space-y-2 rounded-md border border-border bg-background/60 p-3">
                <label class="text-sm" :for="`potm-note-${c.steamId}`">
                  Award Player of the Month to <b>{{ c.name }}</b>? Optional note (shown with the award):
                </label>
                <Textarea :id="`potm-note-${c.steamId}`" v-model="approveNote" rows="2" />
                <div class="flex gap-2">
                  <Button type="button" size="sm" :disabled="busy" @click="approve(c.steamId)">Confirm award</Button>
                  <Button type="button" size="sm" variant="outline" :disabled="busy" @click="confirmFor = null">Cancel</Button>
                </div>
              </div>

              <ul class="mt-2 grid gap-1 text-xs">
                <li v-for="reason in c.disqualifiedBy" :key="reason" class="flex items-center gap-1.5 font-semibold text-destructive">
                  <ShieldAlert class="size-3.5" aria-hidden="true" /> Not eligible: {{ reason }}
                </li>
                <li v-for="flag in c.flags" :key="flag" class="text-[hsl(var(--tac-amber))]">Check: {{ flag }}</li>
                <li v-if="c.notCounted.draft || c.notCounted.custom || c.notCounted.eloVoided" class="text-muted-foreground">
                  Not counted: {{ c.notCounted.draft }} draft room, {{ c.notCounted.custom }} custom, {{ c.notCounted.eloVoided }} ELO-voided
                </li>
                <li v-for="s in c.sanctions" :key="`${s.type}-${s.createdAt}`" class="text-muted-foreground">
                  Sanction: {{ s.type }} from {{ formatTime(s.createdAt) }}
                  <template v-if="s.removeSanctionDate"> until {{ formatTime(s.removeSanctionDate) }}</template>
                  <template v-if="s.deletedAt"> (removed {{ formatTime(s.deletedAt) }})</template>
                  · {{ s.effect }}<template v-if="s.reason"> · {{ s.reason }}</template>
                </li>
                <li v-if="c.indicators.busiestDay" class="text-muted-foreground">
                  Busiest day {{ c.indicators.busiestDay.date }}: {{ c.indicators.busiestDay.matches }} matches
                </li>
              </ul>
            </article>
          </section>

          <section v-if="review?.events?.length" class="space-y-1">
            <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Audit trail</h2>
            <ol class="grid gap-1 text-xs text-muted-foreground" data-testid="potm-events">
              <li v-for="(e, i) in review.events" :key="i">
                {{ formatTime(e.created_at) }} · <b class="capitalize text-foreground">{{ e.action }}</b> by {{ e.actor_steam_id }}
                <template v-if="e.detail?.winnerSteamId"> · winner {{ nameOf(e.detail.winnerSteamId) }}</template>
                <template v-if="e.detail?.note"> · {{ e.detail.note }}</template>
              </li>
            </ol>
          </section>
        </template>
      </div>
    </PageTransition>
  </main>
</template>
