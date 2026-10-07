import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("chat log page and menu entry are open to moderators and above", async () => {
  const page = await read("pages/matches/[id]/chat-log.vue");
  assert.match(page, /middleware: \["moderator"\]/);
  assert.doesNotMatch(page, /middleware: \["admin"\]/);
  const actions = await read("components/match/MatchActions.vue");
  assert.match(
    actions,
    /canViewChatLog\(\) \{\s*return \(\s*this\.matchHasEnded &&\s*useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.moderator\)/,
  );
  // Still read-only and ended-matches-only.
  assert.equal([...page.matchAll(/:can-send="false"/g)].length, 3);
  assert.match(page, /v-if="!matchHasEnded"/);
});

test("chat log panels fill the page height and stack on small screens", async () => {
  const page = await read("pages/matches/[id]/chat-log.vue");
  assert.match(page, /lg:h-\[calc\(100dvh-15rem\)\]/);
  assert.match(page, /lg:min-h-\[32rem\]/);
  assert.match(page, /lg:grid-cols-3/);
  assert.equal([...page.matchAll(/\bfill-height\b/g)].length, 3);
  assert.match(page, /h-\[70dvh\] min-h-\[24rem\]/);
  const lobby = await read("components/chat/ChatLobby.vue");
  assert.match(lobby, /fillHeight: \{\s*type: Boolean,\s*default: false,/);
  assert.match(lobby, /if \(this\.fillHeight\) \{\s*return "relative flex min-h-0 flex-col/);
  // The match-page cards keep their fixed height.
  assert.match(lobby, /return "relative flex h-\[307px\] flex-col rounded-xl bg-muted\/50 p-4";/);
});

test("moderators load the abandoned-match bans next to the sanctions", async () => {
  for (const file of ["components/PlayerSanctions.vue", "components/SanctionsHistoryPanel.vue"]) {
    const source = await read(file);
    assert.match(
      source,
      /return !useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.moderator\);/,
      file,
    );
    assert.doesNotMatch(source, /isRoleAbove\(e_player_roles_enum\.match_organizer\);\s*\},\s*result/, file);
  }
});

test("verification application pages update live", async () => {
  const detail = await read("pages/verification-applications/[id].vue");
  assert.match(detail, /subscription VerificationApplicationDetailLive/);
  assert.match(detail, /\$subscribe: \{\s*verificationApplicationLive/);
  const status = await read("pages/verify/status.vue");
  assert.match(status, /subscription MyVerificationApplicationLive/);
  assert.match(status, /\$subscribe: \{\s*myVerificationApplicationLive/);
  // Both subscriptions select the same thread and status the queries do.
  for (const source of [detail, status]) {
    assert.match(source, /messages\(order_by: \{ created_at: asc \}\)/);
    assert.match(source, /this\.application = /);
  }
  // The post-action refresh no longer flashes the spinner over live data.
  assert.equal([...(detail + status).matchAll(/this\.loading = !this\.application;/g)].length, 2);
});
