import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const message = read("components/chat/ChatMessage.vue");
const lobby = read("components/chat/ChatLobby.vue");
const socket = read("web-sockets/Socket.ts");
const sanction = read("components/SanctionPlayer.vue");
const history = read("components/PlayerSanctions.vue");

test("chat moderation controls are administrator-only and use the message Steam ID", () => {
  assert.match(
    message,
    /isRoleAbove\(e_player_roles_enum\.administrator\)/,
  );
  assert.match(message, /player:\s*this\.message\.from/);
  assert.match(message, /messageId:\s*this\.message\.id/);
  assert.match(message, /confirm_delete_message/);
});

test("message deletion is room-qualified and updates shared lobby state", () => {
  assert.match(
    lobby,
    /socket\.deleteChat\(this\.type as ChatType, this\.lobbyId, id\)/,
  );
  assert.match(
    socket,
    /deleteChat\(type: ChatType, roomId: string, messageId: string\)/,
  );
  assert.match(socket, /lobby\.setMessages\(lobby\.messages\.filter/);
});

test("website chat mute reuses SanctionPlayer with evidence and server status", () => {
  assert.match(lobby, /initial-type="website_chat_mute"/);
  assert.match(lobby, /:evidence-message-id="muteEvidenceMessageId"/);
  assert.match(lobby, /chat:mute-status/);
  assert.match(lobby, /effectiveCanSend/);
  assert.match(lobby, /Intl\.DateTimeFormat/);
  assert.match(sanction, /website_chat_mute/);
  assert.match(sanction, /evidence_message_id/);
  assert.match(sanction, /isSiteAdministrator/);
});

test("sanction history distinguishes website chat mutes and reserves revocation for admins", () => {
  assert.match(history, /sanction\.type === 'website_chat_mute'/);
  assert.match(history, /Website Chat Mute/);
  assert.match(
    history,
    /sanction\.type === "website_chat_mute"[\s\S]*this\.isSiteAdministrator/,
  );
});
