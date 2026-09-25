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
    /hasMessageActions\(\)\s*\{\s*\n\s*return this\.canModerate \|\| this\.showReactionControls;/,
  );
});

test("Mute and Delete stay administrator-only; React is gated by the chat's reaction setting", () => {
  assert.match(message, /:can-moderate="canModerate"/);
  assert.match(message, /:can-react="showReactionControls"/);
  assert.match(message, /@react="toggleReaction"/);
  assert.match(
    menu,
    /<template v-if="canModerate">[\s\S]*emit\('mute'\)[\s\S]*emit\('delete'\)[\s\S]*<\/template>/,
  );
  assert.match(menu, /<DropdownMenuSub v-if="canReact">/);
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

test("Edit is still announcement-only and reuses the existing confirm/cancel flow", () => {
  assert.match(message, /canEdit\(\)\s*\{\s*\n\s*return this\.canModerate && this\.chatType === "announcement";/);
  assert.match(message, /:can-edit="canEdit"/);
  // One shared placement is wired to the existing handlers.
  const editWiring = message.match(/@edit="startEdit"/g) ?? [];
  const muteWiring = message.match(/@mute="requestMute"/g) ?? [];
  const deleteWiring = message.match(/@delete="requestDelete"/g) ?? [];
  assert.equal(editWiring.length, 1);
  assert.equal(muteWiring.length, 1);
  assert.equal(deleteWiring.length, 1);
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
