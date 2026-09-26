import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const message = read("components/chat/ChatMessage.vue");
const menu = read("components/chat/ChatMessageActionsMenu.vue");
const rightHub = read("layouts/components/RightHub.vue");

test("each message owns a named hover group, isolated from the surrounding sidebar", () => {
  assert.match(message, /group\/chat-message relative/);
  assert.match(menu, /group-hover\/chat-message:opacity-100/);
  assert.match(menu, /group-focus-within\/chat-message:opacity-100/);
  assert.doesNotMatch(menu, /(?:^|\s)group-hover:opacity-100/);
  assert.doesNotMatch(rightHub, /group\/chat-message/);
});

test("one shared menu instance is rendered for every moderatable or reactable message", () => {
  assert.equal((message.match(/<ChatMessageActionsMenu/g) ?? []).length, 1);
  assert.match(message, /v-if="hasMessageActions && !isEditing"/);
  assert.match(
    message,
    /hasMessageActions\(\)\s*\{\s*\n\s*return \(\s*\n\s*this\.showReactionControls \|\|\s*\n\s*this\.canEdit \|\|\s*\n\s*this\.canDelete \|\|\s*\n\s*this\.canMute\s*\n\s*\);/,
  );
});

test("each action is gated separately by the shared permission helper; React by the chat's reaction setting", () => {
  assert.match(message, /:can-edit="canEdit"/);
  assert.match(message, /:can-delete="canDelete"/);
  assert.match(message, /:can-mute="canMute"/);
  assert.match(message, /:can-react="showReactionControls"/);
  assert.match(message, /@react="toggleReaction"/);
  assert.match(message, /getChatMessageActionPermissions\(\{/);
  assert.match(menu, /<DropdownMenuItem v-if="canEdit" @click="emit\('edit'\)">/);
  assert.match(menu, /<DropdownMenuItem v-if="canMute" @click="emit\('mute'\)">/);
  assert.match(menu, /v-if="canDelete"[\s\S]*?@click="emit\('delete'\)"/);
  assert.match(menu, /<DropdownMenuSub v-if="canReact">/);
  assert.doesNotMatch(menu, /canModerate/);
});

test("the menu is always anchored to the right for grouped and ungrouped messages", () => {
  const actionBlock = message.match(
    /<ChatMessageActionsMenu\s+v-if="hasMessageActions && !isEditing"[\s\S]*?\/>/,
  )?.[0];
  assert.ok(actionBlock, "message action menu not found");
  assert.match(actionBlock, /align="end"/);
  assert.match(actionBlock, /trigger-class="absolute right-1 top-0 z-10"/);
  assert.doesNotMatch(actionBlock, /\bleft-/);
});

test("message rows reserve a stable right gutter so multiline content cannot collide with the menu", () => {
  assert.match(message, /group\/chat-message relative pl-12 pr-6/);
  assert.doesNotMatch(message, /group-hover[^'"\s]*:pr-|hover:pr-/);
});

test("visibility depends on pointer capability, not viewport width", () => {
  assert.match(menu, /opacity-0/);
  assert.match(menu, /\[@media\(hover:none\)\]:opacity-100/);
  assert.doesNotMatch(menu, /sm:opacity-/);
});

test("each message instance targets only its own id and sender -- Delete and Mute never touch the wrong message", () => {
  assert.match(message, /messageId:\s*this\.message\.id/);
  assert.match(message, /player:\s*this\.message\.from/);
  assert.match(message, /this\.\$emit\("delete-message",\s*\{\s*id:\s*this\.message\.id\s*\}\)/);
});

test("Edit comes from the ownership helper and reuses the existing confirm/cancel flow", () => {
  assert.match(message, /canEdit\(\)\s*\{\s*\n\s*return this\.actionPermissions\.canEdit;/);
  assert.match(message, /:can-edit="canEdit"/);
  assert.doesNotMatch(message, /maxlength/);
  assert.match(message, /isChatMessageTooLong\(message\)/);
  // One shared placement is wired to the existing handlers.
  const editWiring = message.match(/@edit="startEdit"/g) ?? [];
  const muteWiring = message.match(/@mute="requestMute"/g) ?? [];
  const deleteWiring = message.match(/@delete="requestDelete"/g) ?? [];
  assert.equal(editWiring.length, 1);
  assert.equal(muteWiring.length, 1);
  assert.equal(deleteWiring.length, 1);
});

test("edits carry the room so the API can authorize ordinary chat edits, not just announcements", () => {
  const lobby = read("components/chat/ChatLobby.vue");
  const socket = read("web-sockets/Socket.ts");
  assert.match(
    lobby,
    /socket\.editChat\(this\.type as ChatType, this\.lobbyId, id, message\)/,
  );
  assert.match(
    socket,
    /this\.event\(`lobby:chat:edit`, \{ id: messageId, message, type, roomId \}\)/,
  );
});

test("no moderation API, audit, or notification logic changed -- only presentation", () => {
  assert.match(message, /this\.\$emit\("edit-message", \{ id: this\.message\.id, message \}\)/);
  assert.match(message, /this\.\$emit\("mute-player"/);
  assert.match(message, /window\.confirm\(this\.\$t\("chat\.confirm_delete_message"/);
});

test("the shared menu component uses a real DropdownMenu (Escape/click-outside/no hover-flicker come for free), not a custom hover popup", () => {
  assert.match(menu, /from "~\/components\/ui\/dropdown-menu"/);
  assert.match(menu, /<DropdownMenu v-model:open="open">/);
  assert.doesNotMatch(menu, /@mouseleave|@mouseenter/);
});

test("the trigger supports keyboard focus, touch pointers, and stays visible while open", () => {
  assert.match(menu, /aria-label="\$t\('chat\.message_actions', 'Message actions'\)"/);
  assert.match(menu, /focus-visible:ring-1/);
  assert.match(menu, /group-focus-within\/chat-message:opacity-100/);
  assert.match(menu, /\[@media\(hover:none\)\]:opacity-100/);
  // Explicit open-state override keeps the trigger visible even if the
  // pointer leaves the message while the portalled dropdown is in use.
  assert.match(menu, /open\s*\n\s*\? 'opacity-100'/);
});

test("Ellipsis is the trigger icon (Lucide), matching the requested three-dot design", () => {
  assert.match(
    menu,
    /import \{\s*Ellipsis,\s*Pencil,\s*Trash2,\s*MessageSquareOff,\s*SmilePlus,\s*\} from "lucide-vue-next"/,
  );
  assert.match(menu, /<Ellipsis class="h-3 w-3" \/>/);
});

test("React, Edit, Mute and Delete rows share one icon column and label start", () => {
  // Every action icon uses the one shared class; no per-row margins that
  // would push one label further right than the others.
  assert.match(menu, /const actionIconClass = "h-4 w-4 shrink-0";/);
  for (const icon of ["SmilePlus", "Pencil", "MessageSquareOff", "Trash2"]) {
    assert.match(menu, new RegExp(`<${icon} :class="actionIconClass" />`));
  }
  assert.doesNotMatch(menu, /\bmr-2\b/);
  assert.doesNotMatch(menu, /\bml-[0-9]/);
  // The submenu arrow stays on the far right (from the primitive).
  const subTrigger = read("components/ui/dropdown-menu/DropdownMenuSubTrigger.vue");
  const item = read("components/ui/dropdown-menu/DropdownMenuItem.vue");
  assert.match(subTrigger, /<ChevronRightIcon class="ml-auto h-4 w-4" \/>/);
  // Both primitives use the same row box so heights and gaps match.
  for (const src of [subTrigger, item]) {
    assert.match(src, /items-center rounded-sm gap-2 px-2 py-1\.5 text-sm/);
  }
});

test("reaction submenu keeps exactly the four compact chips", () => {
  assert.match(menu, /class="size-8 justify-center p-0 text-base"/);
  const reactions = read("utils/chatReactions.ts");
  for (const emoji of ["👍", "❤️", "🔥", "🎉"]) assert.ok(reactions.includes(emoji));
});
