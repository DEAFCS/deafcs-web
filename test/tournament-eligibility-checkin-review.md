# Tournament eligibility and upstream check-in follow-up

Local review, 2026-10-06. Committed: NO. Pushed: NO. Deployed: NO. Production changed by this task: NO.

## Eligibility diagnosis

TournamentDetail already mounts TournamentEntryGate for registration v1 and v2 and passes the subscribed tournament row as `registration`. Its actual `tournaments_by_pk` subscription selected `min_role` and `can_join`, but omitted `meets_min_role`. The response therefore could not contain that field: EntryGate received `undefined`, not the backend's failed boolean. Its existing `meets_min_role === false` predicate evaluated false, hiding the panel when no other requirement failed. This is the frontend query omission (not missing v1 mounting, and not an identified stale Apollo result).

The backend's stored-User failure was established during the preceding production verification. No new Dosia network response was captured in this local task; the missing response field is established from the exact deployed source subscription, not inferred from the player's cached profile. No backend SQL was changed.

Fix: request `meets_min_role: true` in the existing subscription. Its result handler already assigns `data.tournaments_by_pk` to `this.tournament`, and EntryGate's computed predicates update from that row. No extra polling, duplicate query, cached-profile role hierarchy, or changed eligibility semantics were introduced.

Regression coverage checks the real subscription source selection and renders a normal User with `min_role: verified_user, meets_min_role: false` for each v1/v2 × Teams/Free Agents/Both combination. Each shows NOT ELIGIBLE and the failed role only; a later passing subscription-shaped prop update hides the whole panel. Existing invitation and ELO checks remain covered. Organizer/already-entered/status handling is unchanged.

## Current upstream source

Fetched https://github.com/5stackgg/web main before implementation. Exact SHA: `b4b83f23c8b1cb8851d421eee76498b766b5d899`.

Inspected upstream:

- components/tournament/TournamentCheckInPanel.vue (before state, outer card, date formatting and other states)
- components/tournament/TournamentEntryGate.vue
- components/tournament/TournamentDetail.vue (entry-area mounting and separate registration subscription)
- utilities/dateLocale.ts
- i18n/locales/en.json (required_title, required_window, register_heading, register_hint, register_cta)

Directly ported the before-registration block's amber strip, strong inline title, classes, typography, spacing, responsive flex layout, heading, hint and CTA classes into TournamentCheckInBefore. Existing English i18n strings match upstream and are reused. MIT attribution includes the full upstream SHA.

The upstream v2 panel retains its outer card and state machine; only its before-state rendering uses the extracted shared block. Legacy TournamentCheckInInfo replaces the checklist presentation with the same outer card and shared block, moved into the public entry area. No duplicate checklist remains. V1 derives its timestamps from the existing attendanceWindow and forwards the existing handleJoinTournament event. V2 still uses its own timestamps and actions. Entered/blocked v1 viewers do not get another registration CTA. The timing/action adapters remain separate because legacy and unified registration have different backend flows.

The intended visual DEAFCS difference is time text: viewer-local clock values with compact hover/focus tooltips and accessible labels containing the date-correct zone abbreviation. The before card uses i18n slots for these time components rather than plain interpolated strings. There is no permanent timezone notice. Existing time displays outside this card retain their previous tooltip detail.

## Verification

- Eight component suites: **96 passed, 0 failed**. Includes EntryGate, subscription-selection regression, v1/v2/type combinations, check-in before rendering/action forwarding, actual mouse-hover tooltip, v2 pending/done/free-agent states, registration, substitutes, tournament UX, Manage/navigation and stage options.
- Four Node test files: **52 tests, 50 passed, 2 failed**. The two pre-existing tournament-attendance organizer-form source assertions are `calculated window preview is driven by live form values and suppressed when invalid` and `both columns are persisted by the existing save mutation`. These were already recorded before this task. Their organizer form was not changed. All timezone, check-in overlay and Solo Random waitlist checks in this run passed.
- Final Nuxt standalone production build: PASS, heap 8192 MB. No container image built or pushed.
- git diff --check: PASS.
- Local full-page fixtures for v1 and v2: User failure visible and Verified passing panel hidden at **1920, 1440, 1280, 768, 375**. Document scroll width equals viewport width at every size. Desktop/mobile screenshots inspected; register CTA remains responsive.
- Real browser keyboard focus: October `13:00 CEST`, December `13:00 CET`; compact tooltip contains no timezone explanation line. Mouse hover verified with the real tooltip components in the DOM test.
- Local fixture browser error sample: none. Fixtures use no production mutations or live participant data. These checks do not claim a fresh authenticated Dosia production browser verification.

## Behavior preservation

No API, SQL, registration mutation, roster minimum, automatic check-in or draft/promotion implementation changed. Competitive minimum 5 / optional maximum 7 remains covered by component and existing attendance tests. The previously production-verified during-window auto-confirm, FA-generated promotion, premade exclusion and Random v2 behavior are preserved by unchanged backend code; this task did not rerun production SQL fixtures. Random waitlist checks passed locally. Registered v2 state transitions and action forwarding remain covered.

## Exact changed files

1. components/tournament/TournamentDetail.vue
2. components/tournament/TournamentCheckInBefore.vue (new)
3. components/tournament/TournamentCheckInInfo.vue
4. components/tournament/TournamentCheckInPanel.vue
5. components/tournament/TournamentTime.vue
6. test/component/tournament-followup.spec.ts
7. test/component/tournament-check-in-before.spec.ts (new)
8. test/component/tournament-ux.spec.ts
9. test/tournament-time-display.test.mjs
10. test/visual/tournaments/PublicPreview.vue
11. test/visual/tournaments/providers.ts
12. test/tournament-eligibility-checkin-review.md (this report)

Ignored local logs: test/tournament-eligibility-checkin-components-local.log, test/tournament-eligibility-checkin-node-local.log, test/tournament-eligibility-checkin-build-final-local.log. Ignored screenshots: node_modules/.cache/checkin-eligible-1440.jpg and node_modules/.cache/checkin-user-375.jpg. Upstream inspection copies are in node_modules/.cache; no additional checkout was created.

## Repository safety

WEB HEAD/origin main: `ef96a4a85773299a8bb02de6b8d849c2e4fb5903`. API HEAD/origin main: `5483295ed1cd5f1e617703b050906fc135683e05`. Both fetched successfully; no unexpected origin advancement. Latest Theft WEB commits inspected: 6e7634d3, c0c71808, 25641fc1. Latest Theft API commits inspected: b766f70c, 764c4e95, 16caa060. No parallel work was overwritten.

API working tree clean. WEB contains only the listed follow-up changes plus the previously untracked .claude/launch.json. No files staged. Launch file SHA256 unchanged: `7CD72E6D0BDD8B45107351A5F51C5225248B8DEBD609AE506D6CB19771DD2355`.

Stopped for Anders review. No commit, push, image publication, production SQL/setup or deployment performed in this task.
