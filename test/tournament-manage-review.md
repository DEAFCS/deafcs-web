# DEAFCS tournament Manage port — Anders review

Review date: 6 October 2026. Work is local and uncommitted.

## Upstream and repository baseline

| Repository | Exact revision inspected |
| --- | --- |
| Current 5Stack WEB | [`fee0628e0abb0363be00bbc90bdda900351da635`](https://github.com/5stackgg/web/commit/fee0628e0abb0363be00bbc90bdda900351da635) |
| Current 5Stack API | [`70e3bfa090408aa5cb8d17067ad992bcbfc891e5`](https://github.com/5stackgg/api/commit/70e3bfa090408aa5cb8d17067ad992bcbfc891e5) |
| DEAFCS WEB baseline after safe fast-forward | `6e7634d311a380c038228e6092a17015b9da04aa` |
| DEAFCS API baseline | `e72ee13f18a3bb0b43be5418eca7349f45245f9d` |

Both repositories were checked and fetched before editing. WEB started at `d451aa3d676f37e81dc559d8741b5b7ab397cecf`, with only the pre-existing untracked `.claude/launch.json`; it was safely fast-forwarded through 13 remote commits. API already matched origin/main. No reset, stash, discard, rebase, commit or push was performed. Upstream revisions were fetched into review refs in the existing repositories; no duplicate repository was created.

The current upstream Manage, Detail, wizard, registration, stage editor/builder, bracket viewer/controls, sharing, organizers, prizes and Discord flows were compared at source level. Relevant WEB changes include `9ee9382d`, `64453522`, `82ce2177` and `7eaa139b`. API stage validation, generation, registration transitions, deletion/resequencing, progression and scheduling were inspected, including `0425a99d` and `f29ebd55`.

The port adapts upstream's dedicated console, sidebar, inline stage management and separation of public and organizer UI. It retains the stage cards, round labels, upper/lower sections, zoom, fit, fullscreen, pan, split/scroll and share facilities already present in DEAFCS, and fixes the selected-stage sharing/popout behavior and mobile toolbar wrapping. Bye cards and bye-only rounds are hidden without mutating stored brackets; connectors resolve through hidden bye nodes.

This was a source comparison with upstream, not a claim that an authenticated upstream website was visually reviewed side by side.

## Theft work inspected and preserved

The newest tournament work by Blend Hamalaw/Theft was reviewed before editing:

- WEB `6e7634d3`: wizard Next spinner lag and Next LAN label.
- WEB `c0c71808`: English weekday/24-hour date presentation.
- WEB `25641fc1`: soonest-tournament hero, missing translations, wizard navigation.
- WEB `c43e89b7`: tournament hero/banner band.
- WEB `84175012`: list badge/Random cleanup.
- WEB `54bcd31e`, `1f233b80`, `3c43f9e7`, `362a0daa`: banner title, sidebar sizing/typography, wizard ordering/layout and legacy registration-toggle removal.
- API `e5dd0ef2`: finished tournament chat retention for 24 hours.
- API `75f43301`, `c86bcc0e`, `3e5d9eea`, `75b140d7`, `4a4282f6`: bracket seed names, seeding/capacity, generation/check-in and signup behavior.

The wizard's steps, Next timing, conditional venue flow and registration implementation remain intact. Its only runtime change is the post-create destination/recovery wording. The public hero/banner, date formatting and tournament identity remain intact. Existing registration generation, match scheduling and chat-retention code was preserved.

## Manage and public routing

New route: `/tournaments/:tournamentId/manage`. Section state uses `?section=…`.

| Sidebar section | Existing DEAFCS behavior used |
| --- | --- |
| Details & branding | Logo/banner upload, title, description, homepage, start, classification and venue |
| Registration | Unified teams/free-agent/mixed rules, eligibility, invitations and tournament check-in; v1 attendance remains available |
| Teams & invites | Registered tournament teams, v1 individual signups, v2 free agents/parties/waitlist, check-in review, team addition, addressed invites and invite links |
| Stages | Ordered stage cards, first/additional stage, inline edit and guarded deletion |
| Match rules | Existing match options, scheduling, substitutes and webcam controls |
| Prizes | Existing prize row editor and ordering |
| Awards | Existing DEAFCS calculated award mappings and enable control |
| Organizers | Individual organizers and linked organization teams |
| Discord | Existing notification/webhook/role and voice-channel configuration |

Creation now opens Manage → Stages. If award mapping persistence fails after the tournament exists, creation opens Manage → Awards for recovery rather than inserting another tournament.

Existing `?tab=information`, `match-options`, `prizes`, `trophies`, `organizers`, `notifications` and `invites` links are mapped to their Manage sections for organizers. The old match-options/organizers pages redirect to Manage. Invalid section values normalize to Details.

The backend-computed `is_organizer` remains authoritative. Non-organizers see an access-denied message and a public-page link; their Manage forms do not mount. Existing Hasura authorization and action eligibility are unchanged.

The public page retains player registration/check-in, overview, teams, free agents, match settings, bracket, matches, standings/results, rewards and Chat Room access. Administrative tabs, add-team panel, check-in review and lifecycle menu move into Manage. Organizer-specific actions in public team/free-agent/individual cards are suppressed; participants retain their own eligible actions. Organizers receive a Manage link, and Manage receives a View tournament link.

## Stage lifecycle, formats and settings

Stages can be added, edited or removed during Setup/RegistrationOpen while no teams/matches are assigned to the bracket. Empty bracket templates created by the existing engine do not lock configuration. After registration closes or a draw is assigned, structural editing locks and the UI explains why.

Deletion requires confirmation and stays open on failure. The API SQL trigger now rejects direct stage deletion after closing/drawing, while retaining the existing nested whole-tournament cleanup path. Successful pre-draw deletion uses the existing engine's resequencing and bracket regeneration. No explicit drag-to-reorder stage feature was added: the inspected upstream Manage uses ordered addition/deletion and automatic resequencing.

Supported formats remain Single Elimination, Double Elimination, Round Robin and Swiss. Existing stage form controls retain groups/team limits, Round Robin/Swiss settings, BO1/BO3/BO5, third-place/decider BO where applicable, final map advantage and per-round BO overrides. Unsupported formats and BO values are rejected by form validation.

Stage map pools can now be selected from the existing pool catalog for the tournament's mode. The current stage's stored pool remains available, including a historical disabled pool. Saving another option preserves the selected stage pool instead of replacing it with the tournament pool. Map names are displayed in the selector.

Existing tournament forced-map-veto behavior is retained; this change does not add a per-stage switch that disables map veto. Region veto/regions, TV delay, match check-in/ready/technical-timeout settings and match mode retain existing stage controls. Other match-rule defaults continue to come from the tournament. Registration-close/check-in-review/draft transitions and actual bracket/match generation use the existing DEAFCS engine.

The current upstream ranked-progression implementation was inspected but not wholesale substituted for DEAFCS's engine. Existing backend team-count/progression constraints remain authoritative; for example the existing non-Swiss first-stage minimum of four teams per group remains. This is an intentional limit of the management/UI adaptation, not a claim of full backend engine parity.

## Bracket and DEAFCS compatibility

- Stage cards, stage switching, format/BO/team summaries and upper/lower round labeling remain available.
- Zoom/fit, fullscreen, popout, sharing, split/scroll, momentum pan, finished-round filtering and bracket focus remain available.
- Popout and Share now target the stage the viewer selected. Share still offers current, specific and cycling modes.
- Mobile control rows wrap; stage cards/sidebar scroll internally. The bracket canvas remains an intentional internal scroll/pan surface.
- Hidden byes are presentation-only. Bracket IDs, feeder relationships, match links, winners and roster data are not rewritten.
- Follow Team state and amber ring/path treatment remain, including across zoom/fit and stage changes.
- Match reset/cancellation-chain confirmation, negotiated scheduling, projected/real schedule presentation, webcam and match/server flows remain intact.

| DEAFCS feature | Preservation |
| --- | --- |
| ELO | Competitive for 5v5/Random, Wingman for 2v2, Duel for 1v1. No new tournament ladder, table or rating update path. Existing mode helpers/calculation code unchanged. |
| Historical rosters | Original tournament-player/snapshot selections and portrait/podium handling retained. No substitution with current live team roster. |
| Awards | Existing picker, mappings, calculation/profile/trophy display and finished-mapping lock retained. MVP mode restrictions retained. No upstream awards engine or manual grant/revoke flow added. |
| Substitutes | Existing mode rules, roster caps, selected active-player ELO/stat attribution, unused-substitute exclusion and forfeit protections retained. |
| Random v1/v2 | Historical v1 individual signup/attendance/generated-team surfaces remain separate from v2 free-agent/party/draft/check-in surfaces. No backfill or conversion. |
| Mode identity | Existing DEAFCS mode badges/colors and tactical/orange identity preserved; Theft's intentional list simplifications retained. |
| Chat | Existing participant/free-agent authorization, mentions, silent sounds and 24-hour finished retention unchanged. Chat Room stays on the public page. |
| Discord | Existing notification and voice-channel settings reused in Manage, with existing authorization. |
| Match/server | Existing match creation, veto, CT/T handling, scheduling, match pages, scoreboards and demos unchanged. No server infrastructure changes. |

No additional DEAFCS-only feature was deliberately removed in favor of conflicting upstream behavior. Known Awards/ELO/roster/Random/Follow Team differences were preserved as requested. No unresolved new product choice is being silently implemented. Separate Prizes/Awards is the cleaner option explicitly permitted in the request.

## Files

WEB runtime additions:

- `components/tournament/TournamentManage.vue`
- `components/tournament/TournamentStagesManage.vue`
- `pages/tournaments/[tournamentId]/manage.vue`
- `utilities/tournamentManage.ts`
- `utilities/bracketVisibleRounds.ts`

WEB runtime edits:

- `components/tournament/TournamentDetail.vue`
- `components/tournament/TournamentCreateWizard.vue`
- `components/tournament/TournamentInformationForm.vue`
- `components/tournament/TournamentStageForm.vue`
- `components/tournament/TournamentStageBuilder.vue`
- `components/tournament/TournamentBracketViewer.vue`
- `components/tournament/ShareBracketDialog.vue`
- `components/tournament/TournamentTeam.vue`
- `components/tournament/TournamentFreeAgents.vue`
- `components/tournament/TournamentIndividualPlayers.vue`
- `pages/tournaments/[tournamentId]/match-options.vue`
- `pages/tournaments/[tournamentId]/organizers.vue`
- `i18n/locales/en.json`

WEB tests/fixtures:

- New `test/component/tournament-manage.spec.ts` and `tournament-stage-options.spec.ts`.
- Updated Awards/team-leave/wizard regression assertions for relocated forms and Theft's current shared registration schema; test-only Zeus directory resolution added to `test/resolve-aliases-loader.mjs`.
- New `test/visual/tournaments/ManagePreview.vue`; existing `main.ts`, `providers.ts`, `vite.config.ts` extended with local fixture data and Nuxt composable support. Authentication/Apollo mocks are confined to this test harness.
- This review report. Local test logs are ignored by Git.

API:

- `hasura/triggers/tournament_stages.sql`: direct-delete safety guard.
- New `test/tournament-stage-delete-safety.spec.ts`: real SQL regression tests.

No numbered migration, metadata, schema, generated production types, module/provider wiring, production configuration or infrastructure file was changed. The trigger source change would be applied through the established hash-driven setup path only in a separately authorized future release; it has not been applied to production.

## Validation and limits

| Check | Result |
| --- | --- |
| WEB tournament component suites | 8 files, **101 passed** |
| WEB historical-roster/mode-ELO/Awards/team-permission Node checks | **50 passed** |
| WEB updated wizard/shared-registration/routing Node checks | **16 passed**, using `node --experimental-transform-types --test test/tournament-create-wizard.test.mjs` |
| WEB full component run | 57 files: 56 passed, 1 failed; **817 passed, 7 failed** |
| Unchanged Highlights isolation | Same **7 failures**, 12 passes, when run independently; no Highlights files changed |
| API tournament/Awards/ELO unit selection | 7 suites, **102 passed** |
| API real SQL tournament regressions | 9 suites, **167 passed** |
| Nuxt production build | Passed on final runtime edits |
| API build | Passed |
| Real Nest AppModule bootstrap | Not run; no provider/module wiring changed, so the request's conditional requirement does not apply |
| Git diff checks | WEB and API passed |

SQL coverage includes stage creation/generation/progression, direct deletion/cleanup, registration, check-in, attendance, substitutes, chat access and v1 individual participant management. Tests use disposable migrated databases, not production. A first version of the deletion guard incorrectly interfered with tournament cleanup; the real SQL tests caught it, and the nested cleanup path was corrected before the passing final run.

Component coverage includes all nine Manage panels, organizer/non-organizer rendering, invalid section values, v1/v2 separation, first/additional stage editor state, locking after the draw, supported/invalid format/BO, map-pool persistence, bye presentation, zoom bounds and Follow Team retention. The existing historical portrait/podium and mode-ELO checks passed.

Browser QA used real components in the local Vite fixture at **1920, 1440, 1280, 768 and 375 pixels**. Reviewed: sidebar/long tournament title, inline stage form, registration, team/free-agent party/waitlist layout, invitations, details/branding, match rules, prizes, Awards, organizers and Discord. Populated double-elimination/multi-stage and finished historical variants were inspected; stage switching, Follow Team, zoom/fit and selected-stage share URL were exercised. The mobile toolbar overflow found during this review was fixed. After layout settled, checked fixture pages had document width equal to viewport width; brackets used internal scrolling.

Visual fixtures use local mocked Apollo/auth/catalog data. No live create/save/upload/invite/Discord action, authenticated live public hero/tab flow or real game-server session was exercised. Some catalog/auto-import warnings in the standalone fixture reflect its partial Nuxt environment. Production builds and relevant component/SQL tests supply separate validation. Historical roster accuracy is covered by data/source regressions; the visual fixture is not a production-history audit.

Useful local preview URLs (while Vite runs on port 18083):

- `http://127.0.0.1:18083/test/visual/tournaments/index.html?manage`
- Add `&bracket` for populated multi-stage view, `&historical` for finished view, or `&section=teams` for Teams & invites.

The full WEB suite is **not green** because of the isolated existing Highlights failures. They were left untouched as expressly requested. This review is not deployment approval.

## Status

- Committed: **NO**
- Pushed: **NO**
- Deployed: **NO**
- Production changed: **NO**
- `.claude/launch.json`: **untouched**
- Historical production data rewritten: **NO**

Stopped for Anders's review.
