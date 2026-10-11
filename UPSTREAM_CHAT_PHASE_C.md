# Phase C: upstream chat UX and conversation management

Local implementation review, 11 October 2026. Nothing committed, pushed or deployed. No migrations, production data/Redis writes, infrastructure operations, matchmaking changes or game-server changes.

## Source and protected work

- WEB base: `cda68faed08e46b79f6dfe84317c88054f891389`, Phase B; main ahead 1, behind 0 after fetching origin/main.
- API base: `39e2a533fe86c3ce9fe127fe7e2e96258697ab44`, Phase A; main ahead 6, behind 0 after fetching origin/main.
- The six API commits, including `f3b9b7e9`, `e8f10b7d`, `487b49a5`, `f6593e89`, `5da11e26` and Phase A, remain unchanged. No history rewriting or staging.
- Unrelated WEB `components/tournament/TournamentPrizes.vue` and `.claude/launch.json` remain byte-identical to the task's initial snapshots. Their SHA256 hashes are respectively `0135944CF8B3A4406E42B486333BC4D36F274C8AF5FBB227806703C5C8097D2B` and `7CD72E6D0BDD8B45107351A5F51C5225248B8DEBD609AE506D6CB19771DD2355`.
- Root/repository CLAUDE.md, CODEX.md and OPERATIONS.md were read. Relevant GitHub issues were inspected without changing issues or checklists.

## Exact upstream baseline

Fetched and inspected upstream WEB `7a1f7726e0055cb7a8ca43b644cd436ad631cd6c` and API `1a287d1bbede639f2eafd9d6e4b4aa73df51640e` directly as Git objects, without replacement checkouts.

Relevant WEB history inspected:

| Commit | Behavior |
| --- | --- |
| `3be1998d148cfc3bee96fd58e96646d5165e8c02` | Message hover toolbar, reaction picker and moderation menu |
| `219c6a0b83a5093c3b826f58fb0a8cbef6209758` | Floating dock and conversation navigation |
| `e2f9f7bbbaf579d6a2c98bb2070dfc4b4565172a` | Attachments and GIPHY layout |
| `cf73be37e4ea6f002ed32d5eb528c4a0a18ce866` | GIF menu |
| `458e2a6a2e67de050fc318f5cd39701d4051409e` | Up-arrow editing, GIF command and larger text |
| `6faa4fc9422b8f42dd2438b6712a47b3a05acbb4` | Non-friend message requests: inspected, excluded |

Relevant API history: `d2e38a784f49ec567c6b2a1b57a9d3591347da81` (24 reactions), `ed7934e02130591bf796a45d54871719a43278c8` (attachments/GIPHY), `da73b297ac941a23b3f2f8cd2c3ea44344bbc9f8` (non-friend message requests, excluded). Current upstream action handlers, ChatService, reaction IDs, permission checks, read cursors and storage dependencies were compared with DEAFCS.

Current WEB files inspected include ChatMessage, ChatMessageActions, ChatMessageReactions, ChatReactionPicker, ChatReactionMenuStrip, ChatMessageEditor, ChatMessageMedia, ChatMessages, ChatInput, ChatLobby, ChatParticipants, ChatPanel, MessageRequests, MessageRequestsRailButton, NewConversation, useChatTabs, useChatTabSetup, useDockShortcutPrefs, chatMessageActions, constants/chat and Socket. MediaLightbox, FadeImage, chatAttachments, chatInputKeys, chatErrors, haptics and NewChatRailButton were also inspected/adopted.

## Upstream parity and deliberate adaptations

Eight newly adopted files are byte-identical to the exact upstream WEB baseline: ChatReactionPicker.vue, ChatReactionMenuStrip.vue, ChatMessageEditor.vue, FadeImage.vue, NewChatRailButton.vue, chatInputKeys.ts, chatErrors.ts and haptics.ts. Existing FadeSwap.vue already matches upstream in content; its temporary EOL-only difference was removed, so it is not a Phase C logical change.

ChatMessage and ChatMessages adopt upstream layout, grouping within five minutes, 13px text, hover toolbar positioning, list transitions, list-owned editing, edited indicator, keyboard focus recovery and up-arrow editing. ChatMessageActions adopts upstream menu/toolbar, copy, picker, touch menu, permission refresh on opening, async actions, delete confirmation and right-hub hover holds. ChatMessageReactions adopts upstream pills, Fold transitions, quick reactions and picker. ChatPanel adopts upstream midpoint-based pointer dragging, 450ms touch hold, 8px scroll slop, 32px outside-removal margin, insertion indicator, haptics, wiggle and cancellation cleanup. NewConversation uses upstream friend search and keyboard navigation.

Necessary deviations:

1. **Existing payloads/storage:** a presentation-only `normalizeChatMessage` maps `website` to `web`, `attachment` to `attachments[]`, and `gifUrl` to a GIF object. It preserves IDs, mentions, timestamps and private `media`. Blocked payloads strip every media/reaction variant. API history serialization and Redis key namespaces are retained; no incompatible PostgreSQL chat/read-cursor migration.
2. **Reactions:** all 24 upstream IDs plus historical `party`. `party` and `tada` have the same glyph but remain distinct Redis sets and counts. Existing count/viewer-membership payloads are retained; tooltips do not invent reactor identities. The old `utils/chatReactions` shape remains available for existing consumers.
3. **Authorization:** existing administrator-only moderation and backend room authorization remain authoritative. Own edits/deletes retain the inclusive 600,000ms boundary, website-source requirement and 2,000-character limit. Website mutes/restrictions continue to refuse all reaction toggles; upstream's gagged-user reaction-removal exception is not imported. The moderation menu opens DEAFCS's existing evidence-aware website-chat sanction flow rather than upstream voice sanctions.
4. **Correlated actions:** upstream `lobby:edit/delete/react`, `chat:ack/error`, 8-second timeout, 60-second late-answer tracking and in-flight reaction guard are ported. API aliases delegate to existing authorized DEAFCS service methods; old routes remain compatible. Boolean refusals become `not_allowed`, not guessed detailed errors. Successful acknowledgments do not optimistically rewrite history: the existing authoritative broadcast/cache path updates all listeners. Offline actions are not queued/replayed. Invalid/malformed requests and unexpected service exceptions can still leave the client to time out; explicit richer service errors are not fabricated.
5. **Durable edited status:** ordinary edits store `edited_at` in the existing Redis CAS record and broadcast it; announcements read their existing `updated_at` column and broadcast the database-returned timestamp. No new columns. Shared Socket edit handling rejects older edit timestamps and remains safe with duplicate mounted listeners.
6. **Media:** upstream tiles/lightbox/loading/failure/reduced-motion layout uses existing authorized DEAFCS attachment URLs and muted ChatVideoPlayer. Private short videos keep `/matches/chat-video/media/:id`, controls, fullscreen, recording/upload/retry/retention/access and admin-deletion behavior. No microphone requirement, automatic playback or storage extension. Legacy GIF URLs remain supported over HTTPS; absent legacy dimensions use the layout's fallback aspect ratio.
7. **Composer:** retain the DEAFCS recording, mentions, single-file upload and existing GIF picker rather than importing upstream multipart/config/GIPHY services wholesale. Adopt upstream IME-aware Enter and empty-composer up-arrow behavior. Upstream `/gif` search command and multi-file uploading are not ported because they depend on the upstream composer/upload/search architecture; existing DEAFCS GIF selection remains functional. No new backend format is required for existing content.
8. **Conversations:** canonical sorted Steam-ID DM IDs, localStorage history/unread restoration and existing room tabs remain intact. No non-friend requests. NewConversation lists accepted friends; existing API friendship/block checks still control joining/sending/reacting/editing/deleting. Ordering persists through existing localStorage; upstream drag applies to all current DEAFCS rail rooms, preserving existing manual ordering. Standing pinned rooms cannot be closed/dropped away. Mobile close controls are separate native buttons rather than buttons nested inside a rail button. Header (...) and right-click menus share close and dock pin/unpin actions; dock preferences still use Phase B's API.
9. **Unread/webcam:** compose mode hides the message area without tearing down room listeners, clears active read tracking, and does not mark hidden conversations read. Phase A direct push and existing notification preferences remain unchanged. No additional notification-row writes, read-cursor tables or new unread owners. Phase B dock, amber/red badges, timer, Alerts gear and private/lobby/incoming webcam flows remain; no voice dock or microphone-first channels.
10. **Rooms:** preserve Global, Announcements, organizers/Admin, Tournament, shared Match, private Match Team, Captain Pick Team, draft/lobby and Direct room IDs, retention and existing authorization. Match/team remain in Chat Hub; no embedded match-page chat was added. Separate private team listeners retain server-side lineup authorization; spectators gain no private access. No permanent team chat or tournament retention change.

Upstream current deletion behavior removes a deleted line through the shared cache rather than creating a permanent placeholder. DEAFCS tombstones/media cleanup remain server-owned. Current upstream has no reply/quote flow in the inspected message components; none was invented.

## Exact Phase C files

Paths below are relative to the indicated authorized repository; unrelated WEB changes are excluded.

### WEB: implementation

```text
components/chat/ChatInput.vue
components/chat/ChatLobby.vue
components/chat/ChatMessage.vue
components/chat/ChatMessages.vue
components/chat/ChatMessageActions.vue
components/chat/ChatMessageEditor.vue
components/chat/ChatMessageMedia.vue
components/chat/ChatMessageReactions.vue
components/chat/ChatReactionMenuStrip.vue
components/chat/ChatReactionPicker.vue
components/hub/ChatPanel.vue
components/hub/NewChatRailButton.vue
components/hub/NewConversation.vue
components/media/FadeImage.vue
components/media/MediaLightbox.vue
composables/chatAttachmentUploads.ts
composables/useChatTabs.ts
constants/chat.ts
i18n/locales/en.json
i18n/locales/da_DK.json
utilities/chatAttachments.ts
utilities/chatErrors.ts
utilities/chatInputKeys.ts
utilities/chatMessageActions.ts
utilities/chatMessageCompatibility.ts
utilities/haptics.ts
utils/chatReactions.ts
web-sockets/Socket.ts
UPSTREAM_CHAT_PHASE_C.md
```

### WEB: tests

```text
test/chat-message-actions-menu.test.mjs
test/chat-moderation.test.mjs
test/component/chat-badge-colors.spec.ts
test/component/chat-mentions.spec.ts
test/component/chat-message-actions.spec.ts
test/component/chat-message-layout.spec.ts
test/component/chat-panel-room-visibility.spec.ts
test/component/chat-reactions.spec.ts
test/component/chat-video-composer-api.spec.ts
test/component/fixtures/nuxtApp.ts
test/component/chat-phase-c-compatibility.spec.ts
test/component/chat-phase-c-conversations.spec.ts
test/component/chat-phase-c-review-fixes.spec.ts
```

### API

```text
src/chat/chat.gateway.ts
src/chat/chat.service.ts
src/chat/types/ChatReactionIds.ts
src/chat/chat-action-requests.spec.ts
src/chat/chat-message-actions.spec.ts
src/chat/chat-reactions.spec.ts
src/chat/chat-video.spec.ts
```

## Verification and limits

| Check | Result |
| --- | --- |
| API pre-change scoped chat/Captain Pick Jest | 16 suites, 343 tests passed |
| API final scoped chat/Captain Pick Jest | 17 suites, 356 tests passed |
| API production-source `tsc --project tsconfig.build.json --noEmit` | Passed |
| API scoped ESLint, without fixes | Passed |
| WEB full final Vitest | 90 files passed, 1 failed, 1 skipped; 1,248 tests passed, 7 failed, 5 skipped |
| WEB focused message/media/layout/reaction tests | 61 passed |
| New Phase C compatibility/conversation tests | 19 passed |
| Selected Node source checks | 33 passed, 2 failed; both failures reproduced at the pre-change baseline |
| WEB local Nuxt standalone build, 8GB Node heap | Passed |
| Git diff whitespace checks in both repos | Passed |

The seven unchanged full-WEB failures are in highlights-refresh: map duration, queue seeding, owner/admin visibility, match grouping, auto-advance cancellation, current-clip stability, and prefetch retry. The two unchanged Node failures are website-chat sanction-history/admin-revocation source expectations and the Right Hub participant-trigger source expectation. Their production components were not changed to satisfy stale tests.

Full WEB vue-tsc is not green: the existing Vue/Nuxt global typing configuration emits thousands of `$t`/`$apollo` diagnostics, together with existing generated-code/test/tooling issues. New upstream Vue components also inherit that global-typing defect. New Phase C local logic/type errors found during review were corrected; this does not claim the complete repository typecheck passed. API full-source/test tsc is also not green because of pre-existing chat-video Redis mocks, cleanup/typesense and other test typing issues; production-source tsc passes. WEB has no configured ESLint workflow, so no WEB ESLint pass is claimed.

Final WEB vue-tsc produced 10,661 diagnostics. The recorded prior HEAD run produced 10,630; these counts are not evidence that every diagnostic predates Phase C. The imported templates add diagnostics in the same unresolved Vue-global category. Filtering final diagnostics for the newly adopted message/media/conversation sources and new Phase C tests found no remaining non-`$t` errors. After the final type-safe legacy-GIF adjustment, the three compatibility/conversation/action suites were rerun: 44 tests passed.

Local test/build attempts inside the restricted sandbox initially encountered dependency realpath EPERM errors. The checks were rerun with authorized access to installed dependencies; those sandbox failures are not test successes. The full verification build does not publish an image.

Coverage includes grouping, mentions, media-only content, old/canonical payloads, blocking, all 25 reactions, membership/count restoration, reaction/history races, duplicate listeners, stale edits, ack correlation/offline/refusal/timeout, ownership/time boundaries/admin permissions, friends-only DM checks, close/reopen canonical IDs, pin preferences, persisted order, touch hold/scroll cancellation and composer unread ownership. Existing API authorization, rate-limit, short-video retry, cleanup, match/team/Captain Pick and notification tests remain in the passing scoped run. Existing WEB dock/webcam/badge/room tests are included in the full run.

Backend persistence tests use existing disposable in-process fixtures/mocks; no live Redis/PostgreSQL or production end-to-end persistence test was performed. Component tests simulate pointer/touch events; physical iOS/Android drag, browser dialog focus, GIF/image loading, private video playback/fullscreen and camera recording remain real-browser checks. Authenticated browser integration remains pending because local Typesense configuration is unavailable. No claim of production validation or real-player testing.

## Release assessment and next phase

Ready for local review and a scoped commit once Anders approves, with baseline failures and browser limitations explicitly recorded. No known newly failing behavioral test remains. This is not production release approval.

WEB and API must be released together with API first: the new UI needs the additive correlated action endpoints and 25-ID reaction whitelist. An older API would time out new actions/reject newer reaction IDs. Old WEB clients continue using existing handlers. Mixed deployment must be planned explicitly; do not deploy unrelated later commits by selecting local HEAD automatically.

No migrations, Hasura metadata, new infrastructure, secrets, packages or configuration are required by this Phase C patch. Announcements `updated_at` is already part of the existing schema and edit path. Before release, use an isolated authenticated local environment to verify real Redis reconnect/refresh persistence, all chat rooms/lineup restrictions, two-browser notifications/unread, physical mobile drag, media authorization/retries and camera/webcam flows.

Reaction history/cleanup reads now cover 25 IDs instead of five; existing pipelines/Redis namespaces are unchanged, but room history retrieval and cleanup perform more per-message operations. Monitor that overhead in later integration testing. Existing room/video retention remains unchanged. English upstream labels are supplied; two missing Danish errors were added, and new untranslated labels use existing English fallback.

Later phases: 90-day PostgreSQL persistent DMs and read cursors, 30-day permanent team chat, and Alerts/unified notification settings require separate authorization and migration review. Non-friend messaging remains intentionally excluded. Full upstream multipart uploads/GIPHY command/search would need a separately reviewed compatibility port rather than silently replacing DEAFCS recording/upload behavior.

## Approved final-review corrections

The final review found missing English attachment labels and a reduced-motion gap in the legacy GIF adapter. Both corrections were authorized and implemented locally without changing API or unrelated work.

- Copied `chat.attachments.label` (`Attachment`), `label_count` (`{count} attachments`) and `unavailable` (`No longer available`) exactly from freshly fetched upstream WEB `7a1f7726e0055cb7a8ca43b644cd436ad631cd6c`.
- Legacy `gifUrl` messages keep their existing URL and pass `still` to upstream FadeImage when reduced motion is preferred. Canonical GIF IDs still use upstream's static GIPHY rendition; they do not acquire an extra canvas-freeze step. No changes to upload, recording, private video access, reactions or room permissions.
- Added seven regression tests covering exact translations, video-only deletion labels, attachment counts, failed-image accessibility text, legacy preference changes, canonical GIF renditions, blocked media and private video routing.
- Focused verification: five suites, 59 tests passed. The initial test run detected the missing labels and legacy-GIF gap. A transition stub needed correction before the failed-image rendering test could exercise its slot; that test now passes too.
- Full WEB verification: 1,254 passed, eight failed and five skipped. Seven failures are the previously documented highlights-refresh failures. One additional failure appeared in the unchanged camera/PiP drag-click test; its focused rerun alongside the new regression suite passed all 23 tests. The PiP code removes its click guard with a zero-delay timer and the test automatically advances fake timers, making a timing-sensitive failure plausible; this is not a confirmed new chat regression or a conclusively established baseline failure. No unrelated PiP code or tests were changed. All seven new regression tests passed in the full run, and `git diff --check` passed.

These corrections change only `i18n/locales/en.json`, `components/chat/ChatMessageMedia.vue`, the new `test/component/chat-phase-c-review-fixes.spec.ts`, and this report. The Phase C WEB commit manifest now contains 42 files. Existing API changes, all 25 reaction IDs, and the two unrelated WEB files remain preserved. Authenticated browser and physical-device verification remain pending; readiness here means readiness for a local commit, not deployment approval.
