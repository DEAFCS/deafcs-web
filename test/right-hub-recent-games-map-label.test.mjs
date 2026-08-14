import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import cleanMapName from "../utilities/cleanMapName.ts";

const recentGamesPanel = await readFile(
  new URL("../components/hub/RecentGamesPanel.vue", import.meta.url),
  "utf8",
);
const mapLabelSource = await readFile(
  new URL("../utilities/mapLabel.ts", import.meta.url),
  "utf8",
);
const mapLabelModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts
      .transpileModule(
        mapLabelSource.replace(
          'import cleanMapName from "~/utilities/cleanMapName";',
          `const cleanMapName = ${cleanMapName.toString()};`,
        ),
        {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        },
      )
      .outputText,
  ).toString("base64")}`,
);
const mapLabel = mapLabelModule.default;
const mapFields = await readFile(
  new URL("../graphql/mapGraphql.ts", import.meta.url),
  "utf8",
);
const simpleMatchFields = await readFile(
  new URL("../graphql/simpleMatchFields.ts", import.meta.url),
  "utf8",
);
const playerMatchRow = await readFile(
  new URL("../components/player/PlayerMatchRow.vue", import.meta.url),
  "utf8",
);

test("canonical mapLabel cleans official names and prefers workshop labels", () => {
  assert.equal(mapLabel({ name: "de_dust2" }), "Dust2");
  assert.equal(
    mapLabel({ name: "3584384994", label: "Workshop Dust" }),
    "Workshop Dust",
  );
  assert.equal(mapLabel({ name: "3584384994", label: null }), "3584384994");
  assert.equal(cleanMapName("de_dust2"), "Dust2");
});

test("RecentGamesPanel aggregates by stable map identity and stores the canonical label", () => {
  assert.match(recentGamesPanel, /import mapLabel from "~\/utilities\/mapLabel"/);
  assert.match(
    recentGamesPanel,
    /const key = String\(map\?\.id \?\? map\?\.name \?\? ""\);/,
  );
  assert.match(recentGamesPanel, /const label = mapLabel\(map\);/);
  assert.match(recentGamesPanel, /const current = mapCounts\.get\(key\);/);
  assert.match(recentGamesPanel, /current\.count \+= 1;/);
  assert.match(
    recentGamesPanel,
    /mapCounts\.set\(key, \{ label, count: 1 \}\);/,
  );
  assert.match(
    recentGamesPanel,
    /\.map\(\(\[key, \{ label, count \}\]\) => \(\{ key, label, count \}\)\)/,
  );
  assert.match(recentGamesPanel, /:key="map\.key"/);
  assert.match(recentGamesPanel, /\{\{ map\.label \}\}/);
  assert.doesNotMatch(recentGamesPanel, /cleanMapName/);
});

test("the existing match query still supplies map labels and PlayerMatchRow remains label-first", () => {
  assert.match(mapFields, /id: true/);
  assert.match(mapFields, /name: true/);
  assert.match(mapFields, /label: true/);
  assert.match(mapFields, /workshop_map_id: true/);
  assert.match(simpleMatchFields, /map: mapFields/);
  assert.match(playerMatchRow, /label: cleanMapName\(m\.label \|\| m\.name \|\| ""\)/);
});

console.log("Right-hub Recent Games map-label checks passed");
