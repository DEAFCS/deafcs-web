import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatParticipantsList = await readFile(
  new URL("../components/chat/ChatParticipantsList.vue", import.meta.url),
  "utf8",
);
const chatLobby = await readFile(
  new URL("../components/chat/ChatLobby.vue", import.meta.url),
  "utf8",
).then((source) => source.replace(/\r\n/g, "\n"));
const chatPanel = await readFile(
  new URL("../components/hub/ChatPanel.vue", import.meta.url),
  "utf8",
);

test("Right Hub no longer renders the horizontal participant-pill strip", () => {
  assert.doesNotMatch(chatPanel, /overflow-x-auto/);
  assert.doesNotMatch(chatPanel, /rounded-full px-2 py-0\.5/);
  assert.doesNotMatch(chatPanel, /max-w-\[8rem\]/);
});

test("Right Hub 'X in chat' trigger remains visible and toggles the participant list", () => {
  assert.match(
    chatPanel,
    /\$t\("layouts\.chat_panel\.participants_in_chat", \{\s*\n\s*count: activeParticipantsCount,/,
  );
  assert.match(
    chatPanel,
    /@click="\s*\n\s*activeParticipantsCount &&\s*\n\s*\(isParticipantsOpen = !isParticipantsOpen\)/,
  );
});

test("Right Hub renders the shared ChatParticipantsList instead of its own markup", () => {
  assert.match(
    chatPanel,
    /import ChatParticipantsList from "~\/components\/chat\/ChatParticipantsList\.vue";/,
  );
  assert.match(
    chatPanel,
    /<div\s*\n\s*v-if="isParticipantsOpen && activeParticipants\.length"[\s\S]*?<ChatParticipantsList :participants="activeParticipants" \/>/,
  );
});

test("match-page/global ChatLobby also renders the shared ChatParticipantsList (both variants)", () => {
  assert.match(
    chatLobby,
    /import ChatParticipantsList from "~\/components\/chat\/ChatParticipantsList\.vue";/,
  );
  const occurrences = (
    chatLobby.match(/<ChatParticipantsList :participants="participants as any" \/>/g) || []
  ).length;
  assert.equal(occurrences, 2, "expected both the Teleport/global and embedded variants to use it");
});

test("participant list shows an avatar and the full nickname per row", () => {
  assert.match(chatParticipantsList, /<LiveAvatarImg/);
  assert.match(chatParticipantsList, /user\.name/);
  assert.doesNotMatch(chatParticipantsList, /max-w-\[8rem\]|truncate max-w-\[/);
});

test("participant list is height-constrained and scrolls instead of growing the panel indefinitely", () => {
  assert.match(chatParticipantsList, /max-h-52 overflow-y-auto/);
});

test("a participant row with a steam_id links to /players/<steam_id>", () => {
  assert.match(
    chatParticipantsList,
    /<NuxtLink\s*\n\s*v-if="user\.steam_id"\s*\n\s*:to="`\/players\/\$\{user\.steam_id\}`"/,
  );
});

test("a participant row without a steam_id is not wrapped in a broken profile link", () => {
  assert.match(chatParticipantsList, /<div v-else class="[^"]*flex min-w-0 items-center gap-2/);
  // The no-steam-id branch must never construct a `/players/` URL itself.
  const fallbackBranch = chatParticipantsList.slice(
    chatParticipantsList.indexOf("<div v-else"),
  );
  assert.doesNotMatch(fallbackBranch.slice(0, fallbackBranch.indexOf("</li>")), /\/players\//);
});

test("ChatPanel's own participant-count source (activeParticipants/activeParticipantsCount) is unchanged", () => {
  assert.match(
    chatPanel,
    /const activeParticipantsCount = computed\(\(\) => \{[\s\S]*?const key = `\$\{tab\.type\}:\$\{tab\.lobbyId\}`;/,
  );
  assert.match(
    chatPanel,
    /const activeParticipants = computed<[\s\S]*?const key = `\$\{tab\.type\}:\$\{tab\.lobbyId\}`;/,
  );
});

test("ChatLobby's own participant-count source (participants/participantsCount) is unchanged", () => {
  assert.match(
    chatLobby,
    /participantsMap\(\) \{\s*\n\s*const key = `\$\{this\.type\}:\$\{this\.lobbyId\}`;\s*\n\s*return useMatchLobbyStore\(\)\.lobbyChat\[key\];/,
  );
  assert.match(
    chatLobby,
    /participantsCount\(\) \{\s*\n\s*return this\.participants\.length;/,
  );
});

test("no new websocket/presence subscription was introduced -- ChatParticipantsList is a pure presentational component", () => {
  assert.doesNotMatch(chatParticipantsList, /socket|subscribe|useMatchLobbyStore|watch\(/i);
  // Both callers still read the exact same pre-existing store, not a new one.
  assert.match(chatLobby, /useMatchLobbyStore\(\)\.lobbyChat/);
  assert.match(chatPanel, /matchLobbyStore\.lobbyChat/);
});

test("chat messages render the history-filtered list via ChatMessages", () => {
  assert.match(chatLobby, /<ChatMessages\s*\n\s*v-if="visibleMessages\.length"/g);
  const messagesBlocks = (chatLobby.match(/<ChatMessages/g) || []).length;
  assert.equal(messagesBlocks, 2, "expected both the global and embedded ChatMessages usages intact");
});
