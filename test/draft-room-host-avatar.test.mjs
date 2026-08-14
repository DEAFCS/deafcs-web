import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const settingsBar = await source(
  "components/draft-games/DraftSettingsBar.vue",
);
const draftRoom = await source("components/draft-games/DraftRoom.vue");
const draftPlayerCard = await source(
  "components/draft-games/DraftPlayerCard.vue",
);
const draftGamesStore = await source("stores/DraftGamesStore.ts");
const playerFields = await source("graphql/playerFields.ts");
const avatarUtilitySource = await source("utilities/avatarUrl.ts");

const transpiledAvatarUtility = ts.transpileModule(avatarUtilitySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { resolveAvatarUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledAvatarUtility).toString("base64")}`
);

test("Draft Room HOST uses custom avatar before the Steam avatar", () => {
  assert.match(
    settingsBar,
    /import \{ resolveAvatarUrl \} from "~\/utilities\/avatarUrl";/,
  );

  const resolver = settingsBar.match(
    /const hostAvatarSrc = computed\(\(\) =>([\s\S]*?)\n\);/,
  );
  assert.ok(resolver, "hostAvatarSrc computed resolver not found");
  assert.match(
    resolver[1],
    /resolveAvatarUrl\(\s*props\.room\.host\?\.custom_avatar_url \|\| props\.room\.host\?\.avatar_url,\s*apiDomain,/,
  );
  assert.doesNotMatch(
    resolver[1],
    /roster_image_url/,
    "HOST identity avatar must never consider a roster image",
  );

  assert.match(settingsBar, /<img\s+v-if="hostAvatarSrc"\s+:src="hostAvatarSrc"/);
  assert.doesNotMatch(settingsBar, /:src="room\.host\.avatar_url"/);
});

test("canonical avatar resolver handles relative custom paths and avatar fallback URLs", () => {
  assert.equal(
    resolveAvatarUrl("uploads/avatars/custom.webp", "api.deafcs.net"),
    "https://api.deafcs.net/uploads/avatars/custom.webp",
  );
  assert.equal(
    resolveAvatarUrl("https://avatars.steamstatic.com/base.jpg", "api.deafcs.net"),
    "https://avatars.steamstatic.com/base.jpg",
  );
  assert.equal(resolveAvatarUrl(null, "api.deafcs.net"), null);
});

test("Draft Room host data includes both identity avatar fields", () => {
  assert.match(draftGamesStore, /host:\s*playerFields/);
  assert.match(playerFields, /^\s*avatar_url:\s*true,/m);
  assert.match(playerFields, /^\s*custom_avatar_url:\s*true,/m);
});

test("Available Players remain on PlayerDisplay identity semantics", () => {
  assert.match(
    draftRoom,
    /<DraftPlayerCard[\s\S]*?v-for="player in pool"[\s\S]*?:member="player"/,
  );
  assert.match(
    draftPlayerCard,
    /<PlayerDisplay[\s\S]*?:player="member\.player"/,
  );
  assert.doesNotMatch(draftPlayerCard, /allow-roster-image/);
});

console.log("Draft Room HOST avatar checks passed");
