import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const message = read("components/chat/ChatMessage.vue");
const actions = read("components/chat/ChatMessageActions.vue");
const editor = read("components/chat/ChatMessageEditor.vue");
const permissions = read("utilities/chatMessageActions.ts");
const socket = read("web-sockets/Socket.ts");

test("message hover groups stay isolated from the sidebar", () => {
  assert.ok(message.includes("group/chat-message relative"));
  assert.ok(
    !read("layouts/components/RightHub.vue").includes("group/chat-message"),
  );
});
test("one upstream toolbar is rendered per actionable message", () => {
  assert.equal((message.match(/<ChatMessageActions\s/g) ?? []).length, 1);
  assert.ok(message.includes('v-if="hasActions && room && !editing"'));
});
test("each toolbar action uses the server-aligned permission adapter", () => {
  for (const key of ["canEdit", "canDelete", "canSanction", "canReact"])
    assert.ok(actions.includes(`permissions.${key}`));
  assert.ok(permissions.includes("getChatMessageActionPermissions({"));
  assert.ok(message.includes("this.canPost && this.reactionsEnabled"));
});
test("the toolbar stays above the right edge on grouped and ungrouped lines", () => {
  assert.ok(message.includes('class="absolute right-0.5 z-10"'));
  assert.ok(message.includes("- 0.75rem"));
  assert.ok(actions.includes('align="end"'));
});
test("message rows reserve stable space without hover reflow", () => {
  assert.ok(message.includes('classes.push("pr-7")'));
  assert.doesNotMatch(message, /hover:pr-/);
});
test("touch behavior uses pointer capability rather than viewport width", () => {
  assert.ok(actions.includes('useMediaQuery("(hover: hover)")'));
  assert.ok(actions.includes("[@media(hover:none)]:opacity-100"));
  assert.doesNotMatch(actions, /sm:opacity-/);
});
test("delete and mute retain the exact message identity", () => {
  assert.ok(actions.includes("props.message.id"));
  assert.ok(message.includes("player: message.from, messageId: message.id"));
  assert.ok(actions.includes("socket.deleteMessage("));
});
test("inline editing awaits the correlated result and keeps save/cancel controls", () => {
  assert.ok(editor.includes("await socket.editMessage("));
  assert.ok(editor.includes('@submit.prevent="save"'));
  assert.ok(editor.includes('@keydown.esc="onEscape"'));
  assert.ok(editor.includes("CHAT_MESSAGE_MAX_LENGTH"));
  assert.doesNotMatch(editor, /maxlength=/);
});
test("edits and deletes carry room type and room ID", () => {
  for (const source of [actions, editor]) {
    assert.ok(source.includes("props.room.type"));
    assert.ok(source.includes("props.room.id"));
  }
});
test("correlated action routes do not replace existing legacy routes", () => {
  assert.ok(socket.includes("public deleteChat("));
  assert.ok(socket.includes("public editChat("));
  assert.ok(socket.includes("public deleteMessage("));
  assert.ok(socket.includes("public editMessage("));
});
test("real dropdown and confirmation primitives handle dismissal", () => {
  assert.ok(actions.includes("<DropdownMenu "));
  assert.ok(actions.includes("<AlertDialog "));
  assert.ok(actions.includes("data-right-hub-interactive"));
  assert.ok(actions.includes('v-model:open="confirmDelete"'));
});
test("keyboard and touch retain a named action trigger", () => {
  assert.ok(actions.includes(":aria-label=\"$t('chat.message_actions')\""));
  assert.ok(actions.includes('@focusin="onFocusIn"'));
  assert.ok(actions.includes("focus-visible:ring-1"));
});
test("the upstream Lucide MoreHorizontal is the three-dot trigger", () => {
  assert.ok(actions.includes("<MoreHorizontal />"));
});
test("moderation retains the website mute rather than importing voice sanctions", () => {
  assert.ok(actions.includes('v-if="permissions.canSanction"'));
  assert.ok(actions.includes("emit('mute')"));
  assert.doesNotMatch(actions, /<SanctionPlayer|<DropdownMenuSub/);
});
test("the shared picker exposes 24 upstream IDs and the legacy party ID", () => {
  const constants = read("constants/chat.ts");
  assert.equal((constants.match(/id: "/g) ?? []).length, 25);
  for (const id of ["party", "tada", "thumbsup", "heart", "fire"])
    assert.ok(constants.includes(`id: "${id}"`));
  assert.ok(
    read("components/chat/ChatReactionMenuStrip.vue").includes("grid-cols-6"),
  );
});
