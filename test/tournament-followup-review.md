# Tournament follow-up: local review, 2026-10-06

No commit, push, deployment, production image build/push, or production change was performed. Stop for Anders review.

## Baseline and current 5Stack inspection

Both repositories were checked and fetched before editing. WEB HEAD/origin/main: `cd792cab7890748ade94ebf8d126ff4f22f319c3`; API HEAD/origin/main: `df3c05bc5131a14a146bf183b6e1a539fd5b75b5`. Newest Theft history was inspected, including `6e7634d3`, `c0c71808`, `25641fc1`, and `c43e89b7`. No newer remote work required integration. No reset, stash, rebase, or discard was used.

Current upstream source was inspected before UI edits: WEB `70708563f6335e1f91e087aae0f6cb4f88a1d142`, API `5f185d0294c2abd5d8f2e2f22ef6a26bc53b7930`. Relevant components: TournamentTeam, TournamentEntryGate, TournamentCheckInPanel and TournamentDetail. Relevant API paths: meets_min_role, initial Free Agent draft, promotion, roster-deletion trigger and ProcessTournamentCheckIn. Read-only source copies are in ignored `node_modules/.cache/tournament-followup-upstream`.

## Eligibility

The computed `meets_min_role` used the acting session's role. Roster admission already used the target player's stored role. API Hasura headers cache roles for `60 * 60 * 1000`, so a downgraded stored User could still pass the public computed field with an old Verified User header. The frontend accepted that server verdict. This is a reproduced backend stale-role path, not a role-ordering defect; the exact production account/session was not inspected in this follow-up.

`meets_min_role` now reads the current stored role for the session's player ID and delegates ordering to existing `is_above_role`. Missing/unknown roles fail closed when a minimum is configured. `can_join_tournament` checks stored minimum role too, aligning the registration affordance with admission. No profile-text-only workaround or new hierarchy was introduced.

SQL regression coverage downgrades Verified User to User while retaining the same Verified User session. Local Hasura computed reads change `meets_min_role` and `can_join` from true to false. Existing hierarchy and target-player permission tests pass.

## Requirements and roster UI

All passing requirements: the Entry requirements panel disappears. A failure: red NOT ELIGIBLE, with failed role/ELO rows only and the existing invitation explanation when applicable. The panel does not change Join actions. Role failure continues to come from backend `meets_min_role`, rather than cached profile role. Existing mode-specific ELO handling is retained.

Current 5Stack uses outline Minimize/Maximize icon buttons for roster collapse and a text Leave Tournament button with LogOut icon and red outline styling. DEAFCS now uses the compact accessible collapse icon; the existing matching Leave action and DEAFCS permission gates remain. Add Player uses upstream's full first-empty-slot button with index and UserPlus avatar; remaining empty slots retain capacity numbering. Team-admin controls remain permission-gated.

Competitive readiness uses minimum 5; substitute capacity remains maximum 7 when allowance is 2. Counts/warnings: 3/7 needs 2, 4/7 needs 1, 5/7 through 7/7 have no missing-player warning. A full-size roster that fails another eligibility gate gets a generic blocked label, not a zero/negative player count. Wingman minimum 2; Duel minimum/capacity 1. Existing backend mode/capacity functions are unchanged.

## Check-in

Both the legacy captain action and v2 team check-in use a shared backend guard counting current eligible players against the minimum lineup, never substitute capacity. Existing authorization/window checks remain. Four Competitive players are rejected; five, six and seven are accepted. Real migrated-database tests exercise the actual legacy captain action and v2 service.

Five-player Competitive registration during the open check-in window automatically confirms and produces `checked_in_at`, `eligible_at`, and `tournament_team_lineup_filled = true` with two optional substitute slots, for both legacy team registration and v2. This verifies readiness for seeding; it does not claim a production bracket was generated. Historical Solo Random v1 generation/check-in behavior is unchanged and its regression suite passes.

## Free Agents: generated-team-only rule enforced after clarification

DEAFCS current initial closing draft: premade rows consume stage capacity first; checked eligible agents/parties are packed into complete generated teams. Parties are not split and ELO does not control admission priority. A four-player premade plus one checked-in Free Agent does **not** receive that agent at closing and cannot produce a separate complete five-player FA team. This example is reproduced in a local SQL regression.

Current 5Stack initial draft follows the same generated-team approach.

The pre-fix exception in **both** implementations: `hasura/triggers/tournament_free_agents.sql` installs `tad_tournament_team_roster_free_agents` AFTER DELETE on each `tournament_team_roster` row. A leave/removal/direct roster deletion invokes the trigger, which withdraws any drafted pool identity and calls `promote_tournament_free_agent(OLD.tournament_id, OLD.tournament_team_id)`. Deleting a drafted pool row also deletes its roster row and reaches this same path. Promotion checked team existence and vacancy but did not require `is_drafted`; in supported pre-play states it could insert eligible waitlisted agents into an existing premade. A new real-SQL regression reproduced this: after deletion, the premade became five again with one automatically assigned FA.

Anders explicitly clarified that automatic FA assignment must never fill a premade at any lifecycle point and authorized fixing it before commit. The shared promotion function now requires `tt.is_drafted` as well as matching team/tournament IDs, returning NULL for every premade before assignment. The central restriction covers deletion-trigger and direct/retry calls, preserving withdrawal housekeeping without changing the trigger. Initial draft already creates new `is_drafted = true` teams and never inserts into existing premades. These are the two automatic FA roster-writing functions found in the inspected source. Explicit captain/admin roster addition is unchanged.

Current 5Stack API HEAD was rechecked: `5f185d0294c2abd5d8f2e2f22ef6a26bc53b7930`. It still has the broad deletion call and lacks the generated-team restriction. Sources: [upstream trigger](https://github.com/5stackgg/api/blob/5f185d0294c2abd5d8f2e2f22ef6a26bc53b7930/hasura/triggers/tournament_free_agents.sql), [upstream promotion](https://github.com/5stackgg/api/blob/5f185d0294c2abd5d8f2e2f22ef6a26bc53b7930/hasura/functions/tournaments/promote_tournament_free_agent.sql).

The requested regression now passes: a five-player premade loses one member while checked-in eligible agents and a waitlist exist; the real deletion trigger, explicit promotion retries, and draft retries before/after check-in closes leave it at four, with zero FA pool assignments and zero FA roster insertions into it. Separate Competitive tests confirm normal generated-team promotion and Random v2 generated-team drafting/promotion restore a vacant generated roster to five and preserve check-in. Existing party-aware generated promotion also passes. No new recruitment feature was added.

## Other presentation

Recent Results receives exactly 5px top padding. The legacy check-in explanation uses the current upstream compact amber information hierarchy, real window times and registration close time. Existing registration CTA/status surfaces remain. Viewer-local time remains visible; timezone is only in the existing hover/focus tooltip and accessible label. Date-sensitive CET/CEST logic is unchanged and tested.

Local preview rendered without console errors. At 375px width, overview has no horizontal overflow (375px document width), and keyboard focus displayed the timezone tooltip. Temporary viewport override was reset. The public preview fixture lacks team-role data for roster rows, so roster behavior is verified through component mounting rather than claimed as visual confirmation of those rows.

## Exact checks

- WEB Vitest: **81/81 passed**, 7 files: `tournament-followup`, `tournament-registration`, `tournament-manage`, `tournament-manage-navigation`, `tournament-substitutes`, `tournament-ux`, `tournament-stage-options` under `test/component`.
- WEB Node tests: **81 passed, 2 failed, 83 total**, across `tournament-attendance`, `tournament-attendance-ux`, `tournament-time-display`, `tournament-roster-min-role`, `tournament-team-leave-permissions`, `tournament-public-parity` (`.test.mjs`). Failures are existing source assertions in `tournament-attendance.test.mjs`: calculated organizer window preview and persistence of both columns. Both failed patterns were checked against HEAD; `TournamentInformationForm.vue` is unchanged. No unrelated test/form repair was included.
- WEB Nuxt standalone build: **PASS** using `node --max-old-space-size=8192 node_modules/nuxt/bin/nuxt.mjs build --standalone`. Default-heap attempt exhausted memory; larger-heap retry completed client, server and Nitro.
- API SQL/Hasura: **132 passing tests across the latest successful runs of 5 suites**: `tournament-min-role.spec.ts`, `tournament-registration.spec.ts`, `tournament-substitutes.spec.ts`, `tournament-attendance.spec.ts`, `tournament-min-role-metadata.spec.ts`. Latest registration rerun after the FA correction: **41/41**; latest metadata rerun: **23/23**. Initial metadata positive fixture supplied a Verified header for a stored User; corrected to store Verified User before testing positive admission, then added the stale-header downgrade case. Other three suites passed in the initial focused run (68 tests combined).
- API controller unit tests: **33/33 passed**, `src/tournaments/tournaments.controller.spec.ts`.
- API Nest build: **PASS**, `node node_modules/@nestjs/cli/bin/nest.js build`.
- `git diff --check`: **PASS** in WEB and API. No files staged.

Logs are ignored local files named `test/tournament-followup-*-local.log` in each repository. FA regression evidence: API `test/tournament-fa-premade-before-local.log` (**1 failed, 40 passed**, reproducing automatic premade insertion), then `test/tournament-fa-premade-after-local.log` (**41 passed**, after the central guard). Local SQL test setup applies functions/triggers only to isolated test databases; production functions/triggers were not reapplied. Builds were not repeated for this SQL/test-only clarification.

## Exact changed files

WEB modified:
- `components/tournament/TournamentCheckInInfo.vue`
- `components/tournament/TournamentEntryGate.vue`
- `components/tournament/TournamentTeam.vue`
- `pages/tournaments/index.vue`

WEB new/untracked:
- `test/component/tournament-followup.spec.ts`
- `test/tournament-followup-review.md` (this report)

API modified:
- `hasura/functions/tournaments/can_join_tournament.sql`
- `hasura/functions/tournaments/meets_min_role.sql`
- `hasura/functions/tournaments/promote_tournament_free_agent.sql`
- `src/tournaments/tournament-registration.service.ts`
- `src/tournaments/tournaments.controller.ts`
- `src/tournaments/tournaments.controller.spec.ts`
- `test/tournament-min-role-metadata.spec.ts`
- `test/tournament-min-role.spec.ts`
- `test/tournament-registration.spec.ts`

The pre-existing untracked WEB `.claude/launch.json` remains untouched: SHA256 `7CD72E6D0BDD8B45107351A5F51C5225248B8DEBD609AE506D6CB19771DD2355`. Neither repository has staged files. No dependencies, lockfiles, migrations, production configuration or operations documentation changed. Mode ELO, Awards/MVP, historical roster snapshots, substitutes, chat, Discord and match/server/veto flows were not edited.

Proposed commit messages, for later approval:
- WEB: `fix(tournaments): align eligibility and minimum-lineup roster UX`
- API: `fix(tournaments): use stored roles and minimum lineup for check-in`

Committed: **NO**. Pushed: **NO**. Deployed: **NO**. Production changed: **NO**. Production images built/pushed: **NO**. Production trigger reapplied: **NO**.
