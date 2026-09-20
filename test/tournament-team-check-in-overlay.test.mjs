import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Task 3: regular (team) tournaments never got the automatic check-in popup
// that Solo Random tournaments already have, because
// TournamentCheckInOverlay.vue only ever subscribed to
// tournament_individual_signups -- a team-tournament roster member never has
// a row there. This adds the team-tournament counterpart, reusing the same
// subscription-driven-popup pattern and the existing checkInTournamentTeam
// action, scoped to the team's captain only (plus an explicit tournament
// organizer/administrator emergency override), and coordinated with the
// individual overlay so a player registered both ways never sees both
// popups stacked at once.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const overlaySource = await read(
  "../components/tournament/TournamentTeamCheckInOverlay.vue",
);
const individualOverlaySource = await read(
  "../components/tournament/TournamentCheckInOverlay.vue",
);
const priorityComposableSource = await read(
  "../composables/useCheckInOverlayPriority.ts",
);
const layoutSource = await read("../layouts/default.vue");
const teamSource = await read("../components/tournament/TournamentTeam.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const canManageTeamSource = await read(
  "../../api-deafcs/hasura/functions/tournaments/team/can_manage_team.sql",
);
const tournamentsControllerSource = await read(
  "../../api-deafcs/src/tournaments/tournaments.controller.ts",
);

// --- Root cause: regular tournaments were structurally excluded ------------

test("the individual overlay only ever subscribed to individual signups (root cause of the gap)", () => {
  assert.match(
    individualOverlaySource,
    /tournament_individual_signups\(/,
  );
  assert.doesNotMatch(individualOverlaySource, /tournament_teams\(/);
});

// --- Reuses the existing system, not a new notification mechanism ----------

test("the new overlay is a subscription-driven popup, same pattern as the individual one", () => {
  assert.match(overlaySource, /useSubscription/);
  assert.match(overlaySource, /AlertDialog, AlertDialogContent/);
  assert.match(overlaySource, /setInterval\(\(\) => \{/);
});

test("check-in reuses the existing checkInTournamentTeam action, not a new mutation", () => {
  assert.match(overlaySource, /checkInTournamentTeam: \[/);
  assert.match(overlaySource, /tournament_team_id: current\.value\.id/);
  // Same action the existing on-page button already calls.
  assert.match(teamSource, /checkInTournamentTeam: \[/);
});

// --- Only the captain, only during the open window, only their own team ----

test("the subscription targets the captain specifically, not can_manage or any roster role", () => {
  const sub = overlaySource.slice(
    overlaySource.indexOf("PENDING_TEAM_CHECK_INS_SUBSCRIPTION"),
    overlaySource.indexOf("const { result }"),
  );
  assert.match(sub, /captain_steam_id: \{ _eq: \$steamId \}/);
  // Must not be scoped by can_manage or a roster role -- that would also
  // surface it to non-captain team admins, which the task explicitly
  // excludes.
  assert.doesNotMatch(sub, /can_manage/);
  assert.doesNotMatch(sub, /tournament_team_roster/);
});

test("only shows during an actually-open window, only unresolved check-ins", () => {
  const sub = overlaySource.slice(
    overlaySource.indexOf("PENDING_TEAM_CHECK_INS_SUBSCRIPTION"),
    overlaySource.indexOf("const { result }"),
  );
  assert.match(sub, /checked_in_at: \{ _is_null: true \}/);
  assert.match(sub, /status: \{ _eq: RegistrationOpen \}/);
  assert.match(sub, /individual_check_in_ends_at: \{ _is_null: false \}/);
  // Live-updating ">" comparison can't be expressed in the subscription
  // itself, so it's re-checked client-side every tick, same as the
  // individual overlay.
  assert.match(
    overlaySource,
    /endsAt.*&&\s*new Date\(endsAt\)\.getTime\(\) > now\.value/s,
  );
});

test("scoped per-viewer by $steamId, so a captain of multiple tournaments only sees their own team's popup", () => {
  assert.match(overlaySource, /captain_steam_id: \{ _eq: \$steamId \}/);
  assert.match(overlaySource, /MyPendingTournamentTeamCheckIns\(\$steamId: bigint!\)/);
  assert.match(overlaySource, /const steamId = computed\(\(\) => me\.value\?\.steam_id/);
});

// --- Disappears after success, never repeats, never stacks -----------------

test("closes itself once checked in (subscription drops the row) with no separate dismissed-forever flag needed", () => {
  assert.match(
    overlaySource,
    /The subscription drops this row once checked_in_at is set/,
  );
  // Only one shown at a time.
  assert.match(overlaySource, /pending\.value\[0\] \?\? null/);
});

test("dismiss only hides the prompt -- it never checks in or mutates anything", () => {
  assert.match(overlaySource, /function dismiss\(\)/);
  assert.match(overlaySource, /@click="dismiss"/);
  assert.match(overlaySource, /@escape-key-down="dismiss"/);
  const dismiss = overlaySource.slice(
    overlaySource.indexOf("function dismiss()"),
    overlaySource.indexOf("const secondsLeft"),
  );
  assert.doesNotMatch(dismiss, /mutate|checkInTournamentTeam|delete_/);
  assert.match(dismiss, /dismissedKeys/);
});

// --- Already-open browsers get it live, no refresh needed ------------------

test("uses a live GraphQL subscription, not a one-shot query -- already-open tabs update automatically", () => {
  assert.match(overlaySource, /useSubscription\(/);
  assert.doesNotMatch(overlaySource, /useQuery\(/);
});

// --- Mounted globally, same as the individual overlay -----------------------

test("mounted in the default layout alongside the individual overlay", () => {
  assert.match(
    layoutSource,
    /TournamentTeamCheckInOverlay = defineAsyncComponent/,
  );
  assert.match(layoutSource, /<TournamentTeamCheckInOverlay \/>/);
  // Both present -- neither replaces the other.
  assert.match(layoutSource, /<TournamentCheckInOverlay \/>/);
});

// --- Visual shell reused, not reinvented ------------------------------------

const SHELL_FRAGMENTS = [
  'class="!max-w-md !gap-0 overflow-visible !border-0 !bg-transparent !p-0 !shadow-none"',
  '[box-shadow:0_0_0_1px_hsl(var(--tac-amber)/0.3),0_0_40px_hsl(var(--tac-amber)/0.18)]',
  'absolute left-2 top-2 h-[14px] w-[14px] border-l-2 border-t-2 border-[hsl(var(--tac-amber))]',
  'absolute bottom-2 right-2 h-[14px] w-[14px] border-b-2 border-r-2 border-[hsl(var(--tac-amber))]',
  'absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
];

test("reuses the exact same popup shell as the individual overlay (and the match popup, transitively)", () => {
  for (const fragment of SHELL_FRAGMENTS) {
    assert.ok(
      individualOverlaySource.includes(fragment),
      `individual overlay should contain shell fragment: ${fragment.slice(0, 60)}`,
    );
    assert.ok(
      overlaySource.includes(fragment),
      `team overlay should contain shell fragment: ${fragment.slice(0, 60)}`,
    );
  }
});

test("the individual overlay's own subscription and behavior are unaffected", () => {
  assert.doesNotMatch(individualOverlaySource, /TournamentTeamCheckInOverlay/);
  assert.match(individualOverlaySource, /tournament_individual_signups\(/);
});

// --- No conflict when a player has multiple simultaneous registrations -----
//
// A player can be registered for one tournament individually (Solo Random)
// and be the captain of a team in a *different* tournament at the same
// time, with both check-in windows open. Each overlay is an independent,
// globally-mounted AlertDialog with its own subscription, so without
// coordination both could become visible together: two stacked backdrops,
// two competing focus traps. A shared singleton ref (module-scope, not
// per-component state) gives the individual overlay strict priority; the
// team overlay's own `open` computed stays false for as long as the
// individual one is actually shown.

test("a shared priority singleton exists and is a module-scope ref (not per-component state)", () => {
  assert.match(priorityComposableSource, /export const individualCheckInOpen = ref\(false\)/);
});

test("the individual overlay reports its own open state into the shared singleton", () => {
  assert.match(
    individualOverlaySource,
    /import \{ individualCheckInOpen \} from "~\/composables\/useCheckInOverlayPriority"/,
  );
  assert.match(
    individualOverlaySource,
    /watch\(open, \(value\) => \{\s*individualCheckInOpen\.value = value;/,
  );
});

test("the team overlay stays closed while the individual overlay is open, even if it has its own pending check-in", () => {
  assert.match(
    overlaySource,
    /import \{ individualCheckInOpen \} from "~\/composables\/useCheckInOverlayPriority"/,
  );
  const openBlock = overlaySource.slice(
    overlaySource.indexOf("const open = computed"),
    overlaySource.indexOf("const open = computed") + 400,
  );
  assert.match(openBlock, /!individualCheckInOpen\.value/);
});

// --- Copy ---------------------------------------------------------------

test("team overlay uses its own title/button copy, distinct from the individual one", () => {
  assert.match(overlaySource, /check_in\.team_overlay_title/);
  assert.match(overlaySource, /check_in\.team_check_in_now/);
  assert.equal(
    enLocale.tournament.players.check_in.team_overlay_title,
    "Check in your team",
  );
  assert.equal(
    enLocale.tournament.players.check_in.team_check_in_now,
    "Check In Team",
  );
});

test("DEAFCS writing style: no em dashes in the new copy", () => {
  const copy = JSON.stringify([
    enLocale.tournament.players.check_in.team_overlay_title,
    enLocale.tournament.players.check_in.team_check_in_now,
  ]);
  assert.doesNotMatch(copy, /—/);
});

// --- Backend enforcement: not just a hidden button --------------------------

const checkInTournamentTeamAction = () =>
  tournamentsControllerSource.slice(
    tournamentsControllerSource.indexOf(
      "public async checkInTournamentTeam",
    ),
    tournamentsControllerSource.indexOf(
      "public async ",
      tournamentsControllerSource.indexOf(
        "public async checkInTournamentTeam",
      ) + 1,
    ),
  );

test("checkInTournamentTeam authorizes the row's own captain_steam_id directly", () => {
  const action = checkInTournamentTeamAction();
  assert.match(action, /captain_steam_id: true/);
  assert.match(
    action,
    /String\(team\.captain_steam_id\) === String\(data\.user\.steam_id\)/,
  );
});

test("checkInTournamentTeam does NOT authorize on the general can_manage flag -- only captain or an explicit organizer override", () => {
  // Regression coverage for the Task 3 safety-review correction: this
  // action must not query or branch on `can_manage` at all any more, since
  // that would let an ordinary roster admin or a former owner (no longer
  // captain) check the team in.
  const action = checkInTournamentTeamAction();
  assert.doesNotMatch(action, /can_manage/);
  assert.match(action, /hasEmergencyOverride/);
  assert.match(action, /!isCaptain && !hasEmergencyOverride/);
});

test("the organizer/administrator override is tournament-scoped and parameterized", () => {
  const action = checkInTournamentTeamAction();
  assert.doesNotMatch(action, /is_organizer/);
  assert.match(action, /tournament\.id = \$1/);
  assert.match(action, /tournament\.organizer_steam_id = \$2/);
  assert.match(action, /assigned_organizer\.tournament_id = tournament\.id/);
  assert.match(action, /assigned_organizer\.steam_id = \$2/);
  assert.match(action, /player\.steam_id = \$2/);
  assert.match(action, /player\.role = 'administrator'/);
  assert.match(action, /\[team\.tournament_id, data\.user\.steam_id\]/);
});

// The captain carve-out is deliberately kept local to checkInTournamentTeam
// rather than added to the general-purpose can_manage_tournament_team SQL
// function: that function also backs the `can_manage` computed field used to
// gate roster edit/kick, team identity edit and leave-tournament in the WEB
// UI (TournamentTeam.vue, TournamentTeamMemberRow.vue). Hasura's own
// update/delete permissions for those tables never grant a plain
// captain_steam_id, so broadening the shared function would only surface
// buttons that fail on click for a captain who isn't otherwise an owner,
// roster admin or organizer -- not a real escalation, but avoidable UI
// noise. can_manage_team.sql itself is therefore unchanged by this task.
test("can_manage_tournament_team itself is left unchanged -- the captain carve-out is not added there", () => {
  assert.doesNotMatch(
    canManageTeamSource,
    /tournament_team\.captain_steam_id = _user_steam_id/,
  );
});
