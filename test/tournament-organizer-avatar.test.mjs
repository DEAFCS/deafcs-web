import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The "Organized by" trigger avatar (the small icon shown before hovering)
// read organizer.avatar_url directly, ignoring custom_avatar_url -- so an
// organizer who set a DEAFCS custom avatar still saw their old Steam
// picture there, even though the popover revealed on hover (PlayerDisplay)
// already resolved custom_avatar_url correctly. This is a normal identity
// surface, not a team/tournament roster context -- no roster image
// involved, and no new resolver was introduced.

const source = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);

test("organizerAvatarSrc resolves custom_avatar_url before avatar_url, via the canonical resolveAvatarUrl helper", () => {
  assert.match(
    source,
    /import \{ resolveAvatarUrl \} from "~\/utilities\/avatarUrl";/,
  );
  assert.match(
    source,
    /organizerAvatarSrc\(organizer: any\): string \| null \{\s*\n\s*return resolveAvatarUrl\(\s*\n\s*organizer\?\.custom_avatar_url \|\| organizer\?\.avatar_url,\s*\n\s*this\.apiDomain,\s*\n\s*\);/,
  );
});

test("the trigger avatar binding uses organizerAvatarSrc, not a raw organizer.avatar_url read", () => {
  const triggerBlock = source.slice(
    source.indexOf('<Avatar shape="square" class="h-6 w-6">'),
    source.indexOf("</Avatar>", source.indexOf('<Avatar shape="square" class="h-6 w-6">')),
  );
  assert.match(triggerBlock, /:src="organizerAvatarSrc\(organizer\)"/);
  assert.match(triggerBlock, /v-if="organizerAvatarSrc\(organizer\)"/);
  assert.doesNotMatch(triggerBlock, /:src="organizer\.avatar_url"/);
});

test("no roster-image resolution is introduced for the organizer avatar -- this stays a normal identity context", () => {
  const methodBlock = source.slice(
    source.indexOf("organizerAvatarSrc(organizer: any)"),
    source.indexOf("organizerAvatarSrc(organizer: any)") + 400,
  );
  assert.doesNotMatch(methodBlock, /roster_image_url|resolveRosterImageUrl|allow-roster-image/);
});

test("the hover popover's PlayerDisplay (already correct) is untouched", () => {
  assert.match(
    source,
    /<PlayerDisplay\s*\n\s*:player="organizer"\s*\n\s*:linkable="true"\s*\n\s*:tooltip="false"\s*\n\s*\/>/,
  );
});

console.log("tournament organizer avatar checks passed");
