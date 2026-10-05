# DEAFCS tournament upgrade — local review report
Date: 2026-10-05. Continued the existing working trees; no implementation restart, stash, reset, restoration, staging, commit, push, deployment, or production operation.

## Sources and scope
1. Latest 5Stack WEB revision inspected: `d18c33db0734b13cd7e7c46fbed94de6d7f5a2ed`.
2. Latest 5Stack API revision inspected: `c23d08084075e620387cebeabb2fa62e2b78f828`.
These are the inspected upstream revisions for this task, not a claim that remote branches cannot have advanced since inspection.
Local HEADs remain WEB `07bf17f3d7ed744a6e2556ac396a7cbe5f1b2848` and API `eeef7927920880d96f1c67a6a4f4aa345311924b`.

3. Ported/adapted: unified Teams/Free Agents/Both registration, party-aware draft and promotion, eligibility and rank gates, direct invitations and invite links, scheduled check-in and review, tournament list discovery/filtering/pagination/quick-look, richer live/finished cards, roster/pool panels, and the tournament sections of Watch.
4. Retained DEAFCS identity, Verified User defaults, sanctions and block rules, accepted Terms, existing mode ELO and season behavior, substitutes, roster snapshots, league exclusion, tournament match flows, Discord integration, tournament chat rules, Awards configuration/calculation, and historical Random registration.
5–6. Exact API and WEB paths are listed in the appendices. There are 58 API task files and 76 WEB code/test files with actual content differences or additions before this report; this report is one additional WEB review artifact. Two WEB paths (`composables/useTournamentContext.ts`, `graphql/tournamentFilters.ts`) appear modified in status but have no content diff. Existing untracked `.claude/launch.json` is excluded and untouched. The previously cited 69-file checkpoint is superseded by this final inventory.

## Registration and data
7. Added one additive migration: `1889000000000_deafcs_tournament_registration`. Adds registration type/version, rank bounds, invitation and region settings, scheduled check-in fields/status, Free Agent entries, direct invitations, invite codes/use records, scoped registration unlocks, and roster/team check-in fields. Existing tournaments are backfilled to registration version 1; newly created tournaments default to version 2. Existing migration versions were not reused. Automatic down migration deliberately raises an exception: rollback requires a reviewed migration that preserves participant/invite history.
8. Hasura: tracks seven new tables/enums, adds registration actions and output types, computed eligibility/access/check-in/current-stage fields and relationships, and scoped permissions. Existing Awards/trophy relationships and historical fields remain. Current metadata applied to disposable local Hasura with `allow_inconsistent_metadata:false`: HTTP 200, `is_consistent:true`, no inconsistent objects. A user-role GraphQL query covering new tournament fields, Free Agents, and addressed invite relationships validates successfully (empty local result).
9. Teams accepts premade teams; Free Agents accepts eligible players into a draft pool; Both supports premades and the pool. Premades consume first-stage team capacity before drafting Free Agents.
10. Free Agents are stored separately from historical individual signups, with registered/waitlisted/drafted/withdrawn states, optional party identity, check-in stamps, and generated-team links. Draft and promotion use a shared advisory transaction lock plus row locking to prevent duplicate concurrent allocations.
11. Parties are indivisible units. A lobby captain can register the accepted party; all members must satisfy entry requirements and Terms. Party size cannot exceed the format's lineup size. A party with an ineligible/unconfirmed/already-rostered member is not partially drafted. Random is solo-only.
12. Selection follows signup order and exact packing into complete lineups; an oversized unit is skipped when it cannot fit. This avoids pretending that a numerically sufficient pool necessarily packs (for example 4+4+2 into two five-player teams). Overflow stays waitlisted. Promotion takes the earliest eligible whole unit that fits an opening; parties are not split. A pool that cannot produce any complete team remains available.
13. Free Agents confirm personally, regardless of the team check-in mode. Missing the deadline moves entries to the waitlist and prevents draft selection. Late eligible entries during an open window are confirmed automatically. Organizer review supports extension, re-admission, and continuing; confirmations carry into drafted rosters.
14. ELO balances the selected units across compatible teams; it does not decide who gets a registration slot. Stronger units are assigned to the lowest-rated compatible team, preserving full lineups and whole parties. This is a constrained deterministic balance, not a guarantee of mathematically optimal equal ratings.
15. **NO separate Tournament ELO was introduced.** No new rating table/ladder or match-result ELO engine was added.
16. Competitive reads existing Competitive ELO; Wingman reads existing Wingman ELO; Duel reads existing Duel ELO. Active-season helpers are used when seasons are enabled, otherwise existing mode helpers. Unsupported formats fall back by lineup size (one Duel, two Wingman, otherwise Competitive). Existing historical tournament-rating fields already present in DEAFCS are retained; this new engine does not use them. Unrated eligibility uses the existing 5000 starting value.
17. New Random tournaments are Competitive 5v5, Free Agents, solo registration, Players check-in, with automatic balanced team generation. The UI and server enforce this preset; it cannot be switched after creation.
18. New Random tournaments use the unified pool/draft/check-in engine instead of old individual signup/manual team-generation/old attendance jobs.
19. Old individual actions, individual UI, team-generation service, attendance and expiry jobs remain behind registration-version-1 guards.
20. Existing Random tournaments keep their signup states, historical teams/rosters, schedule freeze behavior, and legacy check-in/management paths. Historical fixtures now explicitly select version 1 rather than accidentally testing the new default.

## DEAFCS compatibility
21. Existing substitutes settings, roster limits and rating behavior remain. Players check-in requires the minimum lineup count, not every substitute on the roster. Adding an unconfirmed substitute does not erase confirmation; losing enough confirmed players invalidates the rollup. Duel keeps its existing no-substitutes rules.
22. Creation defaults to Verified User. Eligibility checks the actual player being added, including teammates, using DEAFCS role ordering, bans and the correct mode ELO. Invite access does not bypass those checks.
23. Direct invites and codes grant scoped player/team entry unlocks, not a tournament place or elevated role. Only addressed recipients/premade team registrars can accept. Organizer/status/target-block checks remain. Code redemption locks the code and tournament in a transaction: concurrent repeat use by the same player costs one use; exhausted/revoked/expired codes fail. Existing legacy team-invite action type is retained; registration invitations use a distinct type.
24. Tournament Chat adds registered/waitlisted/drafted Free Agents to existing participant authorization and mention recipients. Setup visibility remains protected by existing tournament permissions; existing finished-tournament retention applies. Chat remains silent through the existing shared audio protection. Matchmaking sound files were not changed.
25. **DEAFCS Awards remain authoritative.** Existing Award picker, mappings, computation and trophy compatibility are retained; no upstream replacement Awards engine was copied. Existing format/MVP policy remains unchanged.
26. /tournaments now offers shared cards, category/status/search discovery, Next LAN and live features, agenda rows, deferred loading, pagination and quick-look previews while retaining DEAFCS styling and league exclusion.
27. Detail retains the existing DEAFCS page and its Awards, Matches, admin settings, chat and Discord behavior; adds the unified entry gate, check-in/review, Free Agents and invite tabs, with stronger hero presentation and horizontally scrolling tabs.
28. Existing team rosters retain management/snapshots and gain show/hide behavior. Free Agent UI shows party grouping, signup priority, rank, drafted teams, waitlist explanations and organizer draft controls. Mobile pool rows were fixed to prevent name/rank/time overlap.
29. Visual check-in panels show deadlines and action state, personal/team confirmation, organizer review and frozen schedule explanations. The countdown does not introduce audio.
30. Live and paused views show real stage/round/match progress and navigation, format/Random identity, and current activity.
31. Finished cards show champion and available second/third results with a Results link. Upcoming cards show player/team counts and capacity. Visual validation corrected missing prize/paused labels and inappropriate “Register a team” copy on Free Agent entries.
32. Watch's tournament features share the card data and exclude featured tournament IDs from the lower mixed live/upcoming/recent selection. Existing Highlights/video UI and clip components were not changed.
33. Existing Follow Team rings/path emphasis, bracket data and interactions remain. Animation-frame cancellation/unmount fencing prevents stale redraws.
34. Existing Matches views and tournament match scheduling/creation/cancellation behavior remain; the new registration engine feeds them full eligible teams. League-specific flows remain separate.

## Validation and review
35. API: latest focused real migrated-Postgres registration suite **27/27 passed**. Broader tournament SQL validation **22 suites, 332/332 passed**. These counts overlap; they are not additive. Changed controller/generator/chat unit focus **3 suites, 61/61 passed**. Full API unit run **63 suites passed, one failed; 998/999 tests passed** (see item 40).
36. WEB: complete component suite **55 files, 792/792 tests passed**. After the last mobile layout adjustments, the focused tournament/Watch regression run also passed **3 files, 51/51 tests**. Includes existing chat/match/Watch behavior and added tournament helper coverage.
37. Local Nest API build passed.
38. Final local Nuxt production build passed (51.3 MB output). Existing module/chunk/deprecation warnings remain; the duplicate registration watcher discovered during validation was removed.
39. WEB `git diff --check` passes. API CRLF-aware `git -c core.whitespace=cr-at-eol diff --check` passes. Plain API `git diff --check` flags carriage returns on additions to the two existing CRLF TypeScript files; those original formats are preserved to avoid whole-file diff churn. No trailing spaces/extra EOF lines remain in task code after CRLF normalization. Both indexes remain empty. The final review checked tracked changes, new task files, migration safety, metadata consistency, protected paths and unchanged HEADs.
40. All eight reported unrelated failures were reproduced on a pristine detached `origin/main` API worktree at `eeef7927920880d96f1c67a6a4f4aa345311924b`. The admin-reply suite produced the same LF-only assertion failure at `src/system/admin-reply-templates.spec.ts:35` (4 passed, 1 failed). The targeted Awards/ELO run reproduced five Awards upgrade-fixture failures at old migration `1877000018000` (missing role FK fixture data), the Awards hybrid-repair missing-object assertion at line 451, and the ELO series-multiplier assertion at line 183 (7 passed, 7 failed, 9 skipped). The baseline had no source changes before or after testing and was removed after validation. These failures pre-exist this tournament diff; no unrelated Awards/ELO/admin-reply code was changed to make them green. The entire API suite is not claimed green.
41. Intentional upstream differences: explicit engine-version fencing for historical DEAFCS data, existing matchmaking ELO/active seasons, Verified User and Terms defaults, sanctions/blocks, DEAFCS UI and existing detail page, existing substitutes and Awards, and safer concurrent invite/draft transactions. These compatibility requirements take precedence over a verbatim upstream replacement.
42. Did not copy upstream migrations using their historical version numbers, a separate Tournament ELO, upstream Awards replacement, global styling/branding replacements, unrelated Highlights work, or production/deployment configuration. English strings were merged without replacing existing DEAFCS copy; other locales use existing English fallback for new keys.
Responsive validation used actual tournament components with isolated authentication/Apollo/Nuxt context fixtures at **1440, 1280, 768, 375 pixels**, with no page horizontal overflow. This is component visual QA, not a signed-in end-to-end test against a live API. The earlier declined providers.ts/vite.config.ts edits were reviewed and applied only because the fixture needed Nuxt locale context; no production provider/config change was forced.

43. Committed: **NO**.
44. Pushed: **NO**.
45. Deployed: **NO**.
46. Production changed: **NO**.

Existing chat-sound commit `4765ffd0d6c4c24f44197555768bb0dbe790dcf1` and Highlights commit `72c816a6040cebc69c7c161467b6ab7a0ffa0304` remain unchanged ancestors of WEB HEAD. Protected chat-sound/Highlights paths have no task diff, apart from the shared Watch test's authorized tournament assertions. `.claude/launch.json` was not touched.

## Exact API task paths (58)
Root: C:/Users/TricoN/Desktop/DEAFCS/api-deafcs

- [hasura/enums/notification-types.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/enums/notification-types.sql)
- [hasura/enums/tournament-free-agent-statuses.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/enums/tournament-free-agent-statuses.sql)
- [hasura/enums/tournament-registration-types.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/enums/tournament-registration-types.sql)
- [hasura/functions/tournaments/assign_seeds_to_teams.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/assign_seeds_to_teams.sql)
- [hasura/functions/tournaments/can_close_tournament_registration.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/can_close_tournament_registration.sql)
- [hasura/functions/tournaments/can_join_tournament.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/can_join_tournament.sql)
- [hasura/functions/tournaments/can_open_tournament_registration.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/can_open_tournament_registration.sql)
- [hasura/functions/tournaments/can_review_tournament_check_in.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/can_review_tournament_check_in.sql)
- [hasura/functions/tournaments/draft_tournament_free_agent_teams.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/draft_tournament_free_agent_teams.sql)
- [hasura/functions/tournaments/player_meets_tournament_requirements.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/player_meets_tournament_requirements.sql)
- [hasura/functions/tournaments/promote_tournament_free_agent.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/promote_tournament_free_agent.sql)
- [hasura/functions/tournaments/tournament_check_in.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/tournament_check_in.sql)
- [hasura/functions/tournaments/tournament_current_stage.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/tournament_current_stage.sql)
- [hasura/functions/tournaments/tournament_free_agent_parties.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/tournament_free_agent_parties.sql)
- [hasura/functions/tournaments/tournament_registration_access.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/functions/tournaments/tournament_registration_access.sql)
- [hasura/metadata/actions.graphql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/actions.graphql)
- [hasura/metadata/actions.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/actions.yaml)
- [hasura/metadata/databases/default/tables/public_e_tournament_free_agent_statuses.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_e_tournament_free_agent_statuses.yaml)
- [hasura/metadata/databases/default/tables/public_e_tournament_registration_types.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_e_tournament_registration_types.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_free_agents.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_free_agents.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_invite_code_uses.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_invite_code_uses.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_invite_codes.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_invite_codes.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_invites.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_invites.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_registration_unlocks.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_registration_unlocks.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_team_roster.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_team_roster.yaml)
- [hasura/metadata/databases/default/tables/public_tournament_teams.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournament_teams.yaml)
- [hasura/metadata/databases/default/tables/public_tournaments.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/public_tournaments.yaml)
- [hasura/metadata/databases/default/tables/tables.yaml](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/metadata/databases/default/tables/tables.yaml)
- [hasura/migrations/default/1889000000000_deafcs_tournament_registration/down.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/migrations/default/1889000000000_deafcs_tournament_registration/down.sql)
- [hasura/migrations/default/1889000000000_deafcs_tournament_registration/up.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/migrations/default/1889000000000_deafcs_tournament_registration/up.sql)
- [hasura/triggers/tournament_free_agents.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournament_free_agents.sql)
- [hasura/triggers/tournament_individual_signups.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournament_individual_signups.sql)
- [hasura/triggers/tournament_invites.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournament_invites.sql)
- [hasura/triggers/tournament_registration_match_options.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournament_registration_match_options.sql)
- [hasura/triggers/tournament_team_roster.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournament_team_roster.sql)
- [hasura/triggers/tournament_teams.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournament_teams.sql)
- [hasura/triggers/tournaments.sql](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/hasura/triggers/tournaments.sql)
- [src/chat/chat.service.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/chat/chat.service.ts)
- [src/invites/invites.controller.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/invites/invites.controller.ts)
- [src/invites/invites.module.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/invites/invites.module.ts)
- [src/matches/jobs/ProcessTournamentAttendance.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/matches/jobs/ProcessTournamentAttendance.ts)
- [src/matches/jobs/ProcessTournamentCheckIn.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/matches/jobs/ProcessTournamentCheckIn.ts)
- [src/matches/jobs/ProcessTournamentCheckInExpiry.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/matches/jobs/ProcessTournamentCheckInExpiry.ts)
- [src/matches/matches.module.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/matches/matches.module.ts)
- [src/tournaments/tournament-registration.controller.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/tournaments/tournament-registration.controller.ts)
- [src/tournaments/tournament-team-generation.service.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/tournaments/tournament-team-generation.service.spec.ts)
- [src/tournaments/tournament-team-generation.service.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/tournaments/tournament-team-generation.service.ts)
- [src/tournaments/tournaments.controller.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/tournaments/tournaments.controller.spec.ts)
- [src/tournaments/tournaments.controller.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/tournaments/tournaments.controller.ts)
- [src/tournaments/tournaments.module.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/src/tournaments/tournaments.module.ts)
- [test/tournament-chat-access.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournament-chat-access.spec.ts)
- [test/tournament-individual-add-player.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournament-individual-add-player.spec.ts)
- [test/tournament-individual-participant-management.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournament-individual-participant-management.spec.ts)
- [test/tournament-registration.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournament-registration.spec.ts)
- [test/tournament-schedule-freeze.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournament-schedule-freeze.spec.ts)
- [test/tournament-substitutes.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournament-substitutes.spec.ts)
- [test/tournaments.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/tournaments.spec.ts)
- [test/utils/tournament-fixtures.ts](C:/Users/TricoN/Desktop/DEAFCS/api-deafcs/test/utils/tournament-fixtures.ts)

## Exact WEB code/test paths (76)
Root: C:/Users/TricoN/Desktop/DEAFCS/deafcs-web

- [components/common/FilterToggle.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/common/FilterToggle.vue)
- [components/common/QuickLookSheet.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/common/QuickLookSheet.vue)
- [components/common/SectionEmpty.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/common/SectionEmpty.vue)
- [components/hub/NotificationsPanel.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/hub/NotificationsPanel.vue)
- [components/match/CheckInDeadline.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/match/CheckInDeadline.vue)
- [components/tournament/TournamentAgendaRow.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentAgendaRow.vue)
- [components/tournament/TournamentBracketPreview.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentBracketPreview.vue)
- [components/tournament/TournamentBracketViewer.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentBracketViewer.vue)
- [components/tournament/TournamentCheckInPanel.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentCheckInPanel.vue)
- [components/tournament/TournamentCheckInReview.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentCheckInReview.vue)
- [components/tournament/TournamentChip.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentChip.vue)
- [components/tournament/TournamentCreateWizard.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentCreateWizard.vue)
- [components/tournament/TournamentDetail.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentDetail.vue)
- [components/tournament/TournamentEntryGate.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentEntryGate.vue)
- [components/tournament/TournamentFactList.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentFactList.vue)
- [components/tournament/TournamentFreeAgentSignUp.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentFreeAgentSignUp.vue)
- [components/tournament/TournamentFreeAgents.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentFreeAgents.vue)
- [components/tournament/TournamentInformationForm.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentInformationForm.vue)
- [components/tournament/TournamentInviteAccept.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentInviteAccept.vue)
- [components/tournament/TournamentInviteLinks.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentInviteLinks.vue)
- [components/tournament/TournamentInvites.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentInvites.vue)
- [components/tournament/TournamentJoinForm.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentJoinForm.vue)
- [components/tournament/TournamentLiveFeature.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentLiveFeature.vue)
- [components/tournament/TournamentNextLan.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentNextLan.vue)
- [components/tournament/TournamentPrizeSplit.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentPrizeSplit.vue)
- [components/tournament/TournamentProgress.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentProgress.vue)
- [components/tournament/TournamentQuickLook.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentQuickLook.vue)
- [components/tournament/TournamentRegistrationForm.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentRegistrationForm.vue)
- [components/tournament/TournamentRegistrationInvite.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentRegistrationInvite.vue)
- [components/tournament/TournamentTeam.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/tournament/TournamentTeam.vue)
- [components/ui/transitions/Fold.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/ui/transitions/Fold.vue)
- [components/ui/transitions/index.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/ui/transitions/index.ts)
- [components/watch/WatchFeaturedTournament.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/watch/WatchFeaturedTournament.vue)
- [components/watch/WatchTournamentCard.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/watch/WatchTournamentCard.vue)
- [components/watch/WatchTournaments.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/components/watch/WatchTournaments.vue)
- [composables/useDeferredLoading.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/composables/useDeferredLoading.ts)
- [composables/useScrollIntoViewOnChange.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/composables/useScrollIntoViewOnChange.ts)
- [composables/useTournamentDisplay.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/composables/useTournamentDisplay.ts)
- [composables/useTournamentPreview.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/composables/useTournamentPreview.ts)
- [generated/zeus/const.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/generated/zeus/const.ts)
- [generated/zeus/index.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/generated/zeus/index.ts)
- [graphql/tournamentBracketFields.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/graphql/tournamentBracketFields.ts)
- [graphql/tournamentCardFields.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/graphql/tournamentCardFields.ts)
- [graphql/tournamentInviteCodes.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/graphql/tournamentInviteCodes.ts)
- [graphql/tournamentInvites.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/graphql/tournamentInvites.ts)
- [graphql/tournamentTeamFields.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/graphql/tournamentTeamFields.ts)
- [i18n/locales/en.json](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/i18n/locales/en.json)
- [pages/tournaments/index.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/pages/tournaments/index.vue)
- [pages/watch/index.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/pages/watch/index.vue)
- [stores/MatchLobbyStore.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/stores/MatchLobbyStore.ts)
- [stores/NotificationStore.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/stores/NotificationStore.ts)
- [test/component/tournament-registration.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/component/tournament-registration.spec.ts)
- [test/component/tournament-ux.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/component/tournament-ux.spec.ts)
- [test/component/watch-page.spec.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/component/watch-page.spec.ts)
- [test/visual/tournaments/Player.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/visual/tournaments/Player.vue)
- [test/visual/tournaments/Preview.vue](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/visual/tournaments/Preview.vue)
- [test/visual/tournaments/index.html](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/visual/tournaments/index.html)
- [test/visual/tournaments/main.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/visual/tournaments/main.ts)
- [test/visual/tournaments/providers.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/visual/tournaments/providers.ts)
- [test/visual/tournaments/vite.config.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/visual/tournaments/vite.config.ts)
- [utilities/dateLocale.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/dateLocale.ts)
- [utilities/playerBlocks.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/playerBlocks.ts)
- [utilities/selectNone.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/selectNone.ts)
- [utilities/tacticalClasses.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tacticalClasses.ts)
- [utilities/tournamentActions.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentActions.ts)
- [utilities/tournamentCheckIn.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentCheckIn.ts)
- [utilities/tournamentCurrentStage.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentCurrentStage.ts)
- [utilities/tournamentElo.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentElo.ts)
- [utilities/tournamentInvites.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentInvites.ts)
- [utilities/tournamentMapPosters.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentMapPosters.ts)
- [utilities/tournamentPlayerRank.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentPlayerRank.ts)
- [utilities/tournamentProgressSteps.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentProgressSteps.ts)
- [utilities/tournamentRegistration.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentRegistration.ts)
- [utilities/tournamentRegistrationCount.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentRegistrationCount.ts)
- [utilities/tournamentStageTeams.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/tournamentStageTeams.ts)
- [utilities/watchEventCard.ts](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/utilities/watchEventCard.ts)

Additional review artifact: [this report](C:/Users/TricoN/Desktop/DEAFCS/deafcs-web/test/tournament-upgrade-review.md).

Local validation logs are ignored Git artifacts and are not source changes. Responsive screenshots are outside the repositories in the task visualization directory.

The final mobile fix also insets timeline labels and makes the horizontal timeline keyboard-focusable. Local Hasura/PostgreSQL and Vite preview services created for validation were stopped; the temporary browser tab was closed and its viewport override reset.

![Desktop component validation](C:/Users/TricoN/.codex/visualizations/2026/10/05/01a10c20-50b3-7282-8268-8b00a8db47e9/tournament-desktop.jpg)

## Final pre-commit safety review

This pass added no feature or refactor. It removed unused copied helpers, restored unrelated English JSON formatting, and restored the generated Zeus default URL from the local validation URL to its existing value. It also corrected the new tournament invitation subscription: organizer access to outgoing invitations must not cause outgoing invitations to appear as incoming actionable notifications. The subscription now requests only invitations addressed to the player or a team they can register (owner, captain, roster Admin). Existing badges and logout cleanup are covered by the added regression case in the existing tournament registration spec.

Every shared WEB addition/change was reviewed for a tournament dependency:

| Shared path or group | Required tournament dependency |
| --- | --- |
| `components/hub/NotificationsPanel.vue` | Displays actionable registration invitations and includes them in the panel's empty-state decision. |
| `stores/NotificationStore.ts` | Subscribes to addressed registration invitations, counts them in unread/personal notifications, and clears them on logout. Existing notification categories remain intact. |
| `stores/MatchLobbyStore.ts` | Keeps tournament chat membership available during the new CheckInReview state. Existing silent-chat protection is unchanged. |
| `utilities/playerBlocks.ts` | Maps invite rejection to the existing nondirectional blocked-player message. Unused blocked-list watcher was removed. |
| `components/common/FilterToggle.vue` | Tournament list's Only Mine filter. |
| `components/common/QuickLookSheet.vue` | Tournament quick-look drawer and keyboard previous/next navigation. |
| `components/common/SectionEmpty.vue` | Tournament list's empty/filter-result presentation. |
| `components/ui/transitions/Fold.vue` and export | Expands registration settings and invite-code use details with reduced-motion support; no existing global transition changed. |
| `composables/useDeferredLoading.ts`, `useScrollIntoViewOnChange.ts` | Tournament query loading/refetch skeleton and category-filter scroll behavior. |
| `composables/useTournamentDisplay.ts`, `useTournamentPreview.ts` | Shared tournament card data and preview/header caching. |
| `utilities/dateLocale.ts`, `selectNone.ts` | Localized tournament dates and the registration form's no-minimum-role sentinel. Unused nullable-field helper was removed. |
| `utilities/watchEventCard.ts` | Shared tournament format/state/champion labels. Unused generic event date/progress/organizer helpers were removed. |
| `utilities/tacticalClasses.ts` | Tournament list's two creation-button styles; existing style exports remain intact. |
| `pages/watch/index.vue` and Watch tournament components | Tournament cards and featured-card deduplication; Highlights implementation is unchanged. |
| `generated/zeus/const.ts`, `index.ts` | Generated API schema bindings for new fields, relationships and actions. Existing schema entries missing from the old snapshot also appear mechanically; no unrelated API feature/permission was changed. Default URL is restored. |
| `graphql/tournamentTeamFields.ts` | New tournament check-in settings/counts and participant roster data. |
| `i18n/locales/en.json` | Tournament/Watch/quick-look labels and required shared labels. Unused copied keys and unrelated formatting changes were removed. |
| `test/component/*` task specs | Tournament behavior and shared Watch compatibility checks; the registration spec now checks addressed invite queries, badge behavior and logout. |
| `test/visual/tournaments/*` | Isolated responsive component QA fixtures. `providers.ts` supplies the Nuxt locale context required by actual tournament date helpers; `vite.config.ts` maps that context inside the preview only. No production provider/build configuration was changed. |

`composables/useTournamentContext.ts` and `graphql/tournamentFilters.ts` still have no content diff. The other new tournament-named utilities/components are used by the tournament implementation. `.claude/launch.json` remains excluded and untouched.

### Migration upgrade evidence and rollback requirements

The migration is additive against the reviewed `origin/main` schema. Existing rows receive `registration_version = 1` through the added column's initial default, then the default changes to 2 for future inserts. No existing tournament is switched to version 2, including historical Random tournaments. The migration does not replace old signup/team/roster/award tables. Its check-in latch update matches no origin/main rows because `check_in_ends_at` is newly added and NULL. Constraint/primary-key adjustments are confined to tables newly introduced by this migration. This is a once-tracked migration, not a script to rerun outside migration bookkeeping.

A disposable PostgreSQL upgrade experiment booted the pristine old schema, populated a finished tournament with teams, rosters and calculated Awards plus a historical Random tournament with individual signups, and applied only the new up migration transactionally. **Passed:** every original column/value in all 12 checked tables/views remained identical; all existing tournaments (including Random) were version 1; inserting a new tournament used version 2. Preserved rows: 2 tournaments, 5 match_options, 4 teams, 8 team_roster, 4 tournament_teams, 8 tournament_team_roster, 3 individual_signups, 8 awards, 3 award_occurrences, 9 award_recipients, 9 tournament_trophies, 0 trophy_configs. Live production data was not accessed or changed; no claim is made that production drift was inspected.

The deliberate non-automatic down migration remains unchanged. Production rollback would require a separately reviewed, data-preserving plan:

1. Take and rehearse a restorable backup before deployment; stop new registration/check-in writes and jobs before rollback.
2. Retain/export version-2 free agents, parties, team/player check-ins, invitations, codes, code uses and unlocks. Do not drop these tables or mark all tournaments version 1.
3. Coordinate WEB/API, Hasura metadata, functions, triggers and jobs. Quarantine or explicitly convert version-2 tournaments before old attendance/registration handlers can operate on them; an old binary rollback alone is insufficient.
4. Prefer leaving additive schema/data in place during application rollback. Any later schema reversal must preserve the new history and be rehearsed. If restoring a database backup instead, reconcile all legitimate writes made after that backup.

Focused checks after cleanup and the invitation correction: **3 WEB files, 52/52 tests passed**. Earlier full WEB validation remains **792/792 passed**; it was not needlessly rerun. No API code or metadata changed in this review, so the prior API/metadata validation remains applicable. The final Nuxt rebuild and final whitespace/index/HEAD checks are recorded with the completion verdict below.

**Final verdict: safe to commit locally.** The final Nuxt production rebuild passed (51.3 MB output). WEB diff checks, API CRLF-aware diff checks and whitespace checks of all new task files passed. Both indexes are empty and both HEADs are unchanged. Unrelated API failure files and protected chat-sound/Highlights code have no diff. All eight reported unrelated failures were reproduced on pristine origin/main. The populated old-schema upgrade experiment passed. The temporary pristine worktree and its dependency junction were removed without changing the primary API working tree. No commit, push, deployment or production change was performed; `.claude/launch.json` was untouched. This verdict approves local source review readiness, not a production deployment or an automatic database rollback.
