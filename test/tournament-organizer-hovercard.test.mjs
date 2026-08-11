import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The organizer avatar used a Popover whose open state was driven by THREE
// uncoordinated mechanisms at once: manual @mouseenter/@mouseleave, the
// Popover's own native click-toggle, and its native dismiss/focus-outside
// handling. That produced close/reopen flicker and, because Popover wraps
// its content in reka-ui's FocusScope, auto-focused the inner PlayerDisplay
// NuxtLink on every open -- painting the browser's native focus ring (the
// reported "white border"). HoverCard has no FocusScope and owns its own
// hover/focus lifecycle (open-delay/close-delay + grace area), so replacing
// Popover with HoverCard here removes both bugs at the root instead of
// patching symptoms.

const tournamentDetail = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const playerElo = await readFile(
  new URL("../components/PlayerElo.vue", import.meta.url),
  "utf8",
);
const playerDisplay = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);

function organizerBlock() {
  const start = tournamentDetail.indexOf("tournamentHeroOrganizersClasses\"");
  assert.ok(start !== -1, "expected to find the organizer list wrapper");
  const end = tournamentDetail.indexOf(
    "</div>",
    tournamentDetail.indexOf("</template>", start),
  );
  return tournamentDetail.slice(start, end);
}

test("organizer block uses HoverCard/HoverCardTrigger/HoverCardContent", () => {
  const block = organizerBlock();
  assert.match(block, /<HoverCard\s/);
  assert.match(block, /<HoverCardTrigger as-child>/);
  assert.match(block, /<HoverCardContent/);
});

test("organizer block no longer uses Popover", () => {
  const block = organizerBlock();
  assert.doesNotMatch(block, /Popover/);
});

test("Popover is no longer imported (was scoped to only the organizer block)", () => {
  assert.doesNotMatch(
    tournamentDetail,
    /from "@\/components\/ui\/popover"/,
  );
  assert.match(
    tournamentDetail,
    /import \{\s*HoverCard,\s*HoverCardContent,\s*HoverCardTrigger,\s*\} from "@\/components\/ui\/hover-card";/,
  );
});

test("organizerPopoversOpen state is fully removed", () => {
  assert.doesNotMatch(tournamentDetail, /organizerPopoversOpen/);
});

test("organizer manual @mouseenter/@mouseleave handlers are removed", () => {
  const block = organizerBlock();
  assert.doesNotMatch(block, /@mouseenter/);
  assert.doesNotMatch(block, /@mouseleave/);
});

test("HoverCard uses the proven PlayerElo timing (open-delay 80, close-delay 140)", () => {
  const block = organizerBlock();
  assert.match(block, /<HoverCard\s+:open-delay="80"\s+:close-delay="140"/);
  // Same timing already proven live in PlayerElo.vue's own HoverCard.
  assert.match(playerElo, /:open-delay="80"/);
  assert.match(playerElo, /:close-delay="140"/);
});

test("organizer trigger is a NuxtLink to the organizer's profile, not a bare button", () => {
  const block = organizerBlock();
  const triggerStart = block.indexOf("<HoverCardTrigger as-child>");
  const triggerEnd = block.indexOf("</HoverCardTrigger>");
  const trigger = block.slice(triggerStart, triggerEnd);
  assert.match(trigger, /<NuxtLink/);
  assert.match(
    trigger,
    /:to="\{\s*name: 'players-id',\s*params: \{ id: organizer\.steam_id \},\s*\}"/,
  );
  assert.doesNotMatch(trigger, /<button/);
});

test("trigger keeps the explicit DEAFCS focus-visible ring", () => {
  const block = organizerBlock();
  const triggerStart = block.indexOf("<HoverCardTrigger as-child>");
  const triggerEnd = block.indexOf("</HoverCardTrigger>");
  const trigger = block.slice(triggerStart, triggerEnd);
  assert.match(trigger, /:class="tournamentHeroOrganizerClasses"/);

  const idx = tournamentDetail.indexOf("const tournamentHeroOrganizerClasses =");
  const line = tournamentDetail.slice(idx, tournamentDetail.indexOf(";", idx));
  assert.match(line, /focus-visible:outline-none/);
  assert.match(line, /focus-visible:ring-2/);
  assert.match(line, /focus-visible:ring-\[hsl\(var\(--tac-amber\)\/0\.5\)\]/);
});

test("organizer PlayerDisplay keeps tooltip/elo-interactive/match-type wiring", () => {
  const block = organizerBlock();
  assert.match(block, /:tooltip="false"/);
  assert.match(block, /:elo-interactive="false"/);
  assert.match(block, /:match-type="tournament\.options\?\.type \|\| null"/);
  assert.match(block, /:linkable="true"/);
});

test("current-avatar resolution on the trigger is unchanged", () => {
  const block = organizerBlock();
  assert.match(block, /:src="organizerAvatarSrc\(organizer\)"/);
  assert.match(block, /v-if="organizerAvatarSrc\(organizer\)"/);
  assert.match(block, /<AvatarFallback class="text-\[0\.6rem\]">/);
});

test("PlayerElo.vue and PlayerDisplay.vue are untouched by this fix", () => {
  // interactive/eloInteractive plumbing already existed and is unrelated to
  // this change; confirm both files still expose it exactly as before.
  assert.match(playerElo, /interactive: \{\s*\n\s*type: Boolean,\s*\n\s*required: false,\s*\n\s*default: true,/);
  assert.match(
    playerDisplay,
    /eloInteractive: \{\s*\n\s*type: Boolean,\s*\n\s*default: true,/,
  );
});

console.log("tournament organizer hover card checks passed");
