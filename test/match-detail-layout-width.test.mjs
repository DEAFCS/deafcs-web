import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainContent = await readFile(
  new URL("../layouts/components/MainContent.vue", import.meta.url),
  "utf8",
);
const matchDetail = await readFile(
  new URL("../pages/matches/[id]/index.vue", import.meta.url),
  "utf8",
);
const latestResults = await readFile(
  new URL("../components/home/HomeLatestResultsPreview.vue", import.meta.url),
  "utf8",
);
const pageTransition = await readFile(
  new URL("../components/ui/transitions/PageTransition.vue", import.meta.url),
  "utf8",
);
const globalStyles = await readFile(
  new URL("../assets/css/tailwind.css", import.meta.url),
  "utf8",
);

test("MainContent scopes the match-width cap to matches-id", () => {
  assert.match(
    mainContent,
    /isMatchDetailRoute\s*=\s*computed\(\(\)\s*=>\s*route\.name\s*===\s*["']matches-id["']\)/,
  );
  assert.match(mainContent, /'lg:max-w-7xl':\s*containContentValue/);
  assert.match(
    mainContent,
    /'lg:max-w-\[calc\(1600px\+2rem\)\]':\s*isMatchDetailRoute/,
  );
  assert.doesNotMatch(
    mainContent,
    /'lg:max-w-\[calc\(1600px\+2rem\)\]':\s*!containContentValue/,
  );
});

test("match detail keeps its stable width shell outside match data", () => {
  assert.match(
    matchDetail,
    /<div class="flex flex-col gap-4 md:gap-6 w-full max-w-\[1600px\] mx-auto">\s*<template v-if="match">/,
  );
});

test("page transitions do not animate width or introduce positioned wrappers", () => {
  assert.match(
    pageTransition,
    /enter-active-class="[^"]*transition-\[opacity,transform\][^"]*"/,
  );
  assert.match(
    pageTransition,
    /leave-active-class="[^"]*transition-\[opacity,transform\][^"]*"/,
  );
  assert.doesNotMatch(pageTransition, /enter-active-class="[^"]*(?:width|absolute|fixed)/);
  assert.doesNotMatch(pageTransition, /leave-active-class="[^"]*(?:width|absolute|fixed)/);

  const routeTransitionStyles = globalStyles.slice(
    globalStyles.indexOf("/* Global route transition"),
    globalStyles.indexOf("/* Rendered markdown", globalStyles.indexOf("/* Global route transition")),
  );
  assert.match(routeTransitionStyles, /transition:\s*[\s\S]*opacity[\s\S]*transform/);
  assert.doesNotMatch(routeTransitionStyles, /(?:width|absolute|fixed)/);
});

test("Latest Results uses named NuxtLink navigation to match detail", () => {
  assert.match(
    latestResults,
    /<NuxtLink[\s\S]*:to="\{ name: 'matches-id', params: \{ id: match\.id \} \}"/,
  );
});
