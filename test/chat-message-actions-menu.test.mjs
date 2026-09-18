import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const message = read("components/chat/ChatMessage.vue");
const menu = read("components/chat/ChatMessageActionsMenu.vue");

test("moderation controls no longer share a flex row with the message body", () => {
  // The old layout put a hover-revealed button group in the same flex row
  // as the <p>, via `ml-auto ... group-hover:flex`. That pattern must be
  // gone, and the message paragraph must now render alone (v-else, no
  // sibling button group inside its own row).
  assert.doesNotMatch(message, /ml-auto hidden shrink-0 items-center gap-1 group-hover:flex/);
  const pBlock = message.match(/<p\s+v-else[\s\S]*?<\/p>/)?.[0];
  assert.ok(pBlock, "message <p> not found");
  assert.doesNotMatch(pBlock, /<button/);
  assert.doesNotMatch(pBlock, /<ChatMessageActionsMenu/);
});

test("the header-row menu sits after the timestamp, not beside the message text", () => {
  const headerBlock = message.match(
    /<div\s+v-if="showMeta"[\s\S]*?<\/div>\s*<div v-if="isEditing"/,
  )?.[0];
  assert.ok(headerBlock, "header row block not found");
  const timeIndex = headerBlock.indexOf("<time-ago");
  const menuIndex = headerBlock.indexOf("<ChatMessageActionsMenu");
  assert.ok(timeIndex > -1 && menuIndex > -1, "timestamp or menu missing from header row");
  assert.ok(menuIndex > timeIndex, "menu must come after the timestamp");
});

test("grouped messages without a header get their trigger in the empty left avatar gutter, not an overlay on the text", () => {
  assert.match(message, /needsOverlayMenu\(\)\s*\{\s*\n\s*return this\.canModerate && !this\.showMeta && !this\.isEditing;/);
  const overlayBlock = message.match(
    /<ChatMessageActionsMenu\s+v-if="needsOverlayMenu"[\s\S]*?\/>/,
  )?.[0];
  assert.ok(overlayBlock, "overlay menu not found");
  // Same left-2 slot the avatar itself uses for header rows (pl-12 / left-2)
  // -- never rendered at the same time as the avatar, since both require
  // showMeta to be opposite values, so there's no possible overlap.
  assert.match(overlayBlock, /trigger-class="absolute left-2 top-0 z-10"/);
  assert.doesNotMatch(message, /trigger-class="absolute right-1/);
});

test("the message text reserves no extra space for the menu -- no padding class exists for it at all", () => {
  const pBlock = message.match(/<p\s+v-else[\s\S]*?<\/p>/)?.[0];
  assert.ok(pBlock, "message <p> not found");
  assert.doesNotMatch(pBlock, /pr-\d/);
  assert.doesNotMatch(message, /needsOverlayMenu \? 'pr-/);
  assert.doesNotMatch(message, /group-hover:pr-|hover:pr-/);
});

test("the gutter trigger and the avatar can never render at the same time -- structurally impossible to overlap", () => {
  // Avatar: v-if="showMeta". Gutter trigger: needsOverlayMenu, which is
  // canModerate && !showMeta. Opposite conditions on the same boolean, so
  // there is no state where both are true for the same message.
  assert.match(message, /<div v-if="showMeta" class="absolute left-2 top-0">/);
  assert.match(message, /needsOverlayMenu\(\)\s*\{\s*\n\s*return this\.canModerate && !this\.showMeta/);
});

test("each message instance targets only its own id and sender -- Delete and Mute never touch the wrong message", () => {
  assert.match(message, /messageId:\s*this\.message\.id/);
  assert.match(message, /player:\s*this\.message\.from/);
  assert.match(message, /this\.\$emit\("delete-message",\s*\{\s*id:\s*this\.message\.id\s*\}\)/);
});

test("Edit is still announcement-only and reuses the existing confirm/cancel flow", () => {
  assert.match(message, /canEdit\(\)\s*\{\s*\n\s*return this\.canModerate && this\.chatType === "announcement";/);
  assert.match(message, /:can-edit="canEdit"/);
  // Two placements (header + overlay), each wired to the same handlers.
  const editWiring = message.match(/@edit="startEdit"/g) ?? [];
  const muteWiring = message.match(/@mute="requestMute"/g) ?? [];
  const deleteWiring = message.match(/@delete="requestDelete"/g) ?? [];
  assert.equal(editWiring.length, 2);
  assert.equal(muteWiring.length, 2);
  assert.equal(deleteWiring.length, 2);
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

test("the trigger has an accessible label and stays visible on mobile without hover, and while the menu is open", () => {
  assert.match(menu, /aria-label="\$t\('chat\.message_actions', 'Message actions'\)"/);
  // Mobile-first: opacity-100 by default; hidden-until-hover only kicks in
  // at sm: and up, so touch devices never depend on a hover state.
  assert.match(menu, /opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100/);
  // Explicit open-state override keeps the trigger visible even if the
  // pointer leaves the row while the menu is open.
  assert.match(menu, /open\s*\n\s*\? 'opacity-100'/);
});

test("Ellipsis is the trigger icon (Lucide), matching the requested three-dot design", () => {
  assert.match(menu, /import \{ Ellipsis, Pencil, Trash2, MessageSquareOff \} from "lucide-vue-next"/);
  assert.match(menu, /<Ellipsis class="h-3 w-3" \/>/);
});
