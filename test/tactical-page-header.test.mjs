import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  header,
  tacticalClasses,
  homepage,
  play,
  tournaments,
  watch,
  awards,
  awardManagement,
] = await Promise.all([
  source("../components/TacticalPageHeader.vue"),
  source("../utilities/tacticalClasses.ts"),
  source("../components/home/HomePlayerOverview.vue"),
  source("../pages/play/index.vue"),
  source("../pages/tournaments/index.vue"),
  source("../pages/watch/index.vue"),
  source("../pages/awards/index.vue"),
  source("../pages/awards/manage.vue"),
]);

const headerTemplate = header.match(/<template>([\s\S]*?)<\/template>/)?.[1];
assert.ok(headerTemplate, "TacticalPageHeader template must exist");
const headerRender = new Function(
  "Vue",
  compile(headerTemplate, { mode: "function", prefixIdentifiers: true }).code,
)(Vue);

async function renderHeader(slots) {
  const HeaderUnderTest = {
    props: {
      corners: String,
      inlineActions: Boolean,
      stackActions: Boolean,
    },
    setup() {
      return {
        tacticalTabs: {
          listClass: "tabs-list-marker",
          triggerClass: "tabs-trigger-marker",
        },
      };
    },
    render: headerRender,
  };

  return renderToString(
    Vue.createSSRApp({
      render: () => Vue.h(HeaderUnderTest, { inlineActions: true }, slots),
    }),
  );
}

test("TacticalPageHeader renders default and named title content", async () => {
  assert.match(
    header,
    /<h1[\s\S]*class="relative m-0 font-sans text-\[clamp\(1\.75rem,4\.2vw,3rem\)\][\s\S]*<slot name="title"><slot><\/slot><\/slot>/,
  );
  assert.match(
    header,
    /class="relative bg-\[linear-gradient\(180deg,hsl\(var\(--foreground\)\)_0%,hsl\(var\(--foreground\)\/0\.75\)_100%\)\] bg-clip-text text-transparent \[-webkit-text-fill-color:transparent\]"/,
  );
  assert.match(header, /<slot name="description"><\/slot>/);
  assert.match(header, /<slot name="subtitle"><\/slot>/);
  assert.match(header, /<slot name="actions" :tabs="tacticalTabs"><\/slot>/);

  const html = await renderHeader({
    description: () => Vue.h("span", "HEADER DESCRIPTION"),
    title: () => Vue.h("span", "VISIBLE HEADER TITLE"),
    subtitle: () => Vue.h("span", "HEADER SUBTITLE"),
    actions: ({ tabs }) =>
      Vue.h("button", { "data-tabs": tabs.listClass }, "HEADER ACTION"),
  });
  assert.match(html, /HEADER DESCRIPTION/);
  assert.equal(html.match(/VISIBLE HEADER TITLE/g)?.length, 2);
  assert.match(html, /HEADER SUBTITLE/);
  assert.match(html, /data-tabs="tabs-list-marker"/);
  assert.match(html, /HEADER ACTION/);

  const defaultHtml = await renderHeader({
    default: () => Vue.h("span", "DEFAULT HEADER TITLE"),
  });
  assert.equal(defaultHtml.match(/DEFAULT HEADER TITLE/g)?.length, 2);
});

test("TacticalPageHeader keeps its shared styles isolated", () => {
  assert.doesNotMatch(
    tacticalClasses,
    /tacticalWordmark(?:Title|PageTitle|Foreground|Offset)Classes/,
  );
});

test("homepage, Play, and Tournaments retain their header titles", () => {
  assert.match(
    homepage,
    /<TacticalPageHeader inline-actions>[\s\S]*<template #title>DEAFCS<\/template>/,
  );
  assert.match(
    play,
    /<TacticalPageHeader inline-actions>[\s\S]*<template #title>\{\{ \$t\("pages\.play\.title"\) \}\}<\/template>/,
  );
  assert.match(
    tournaments,
    /<TacticalPageHeader inline-actions>[\s\S]*<template #title>\{\{ \$t\("pages\.tournaments\.title"\) \}\}<\/template>[\s\S]*<template #subtitle>/,
  );
});

test("Watch, Awards, and award management retain shared header content", () => {
  assert.match(
    watch,
    /<TacticalPageHeader>[\s\S]*<template #title>\{\{ \$t\("pages\.watch\.title"\) \}\}<\/template>/,
  );
  assert.match(
    awards,
    /<TacticalPageHeader :inline-actions="canManageAwards">[\s\S]*<template #title>Awards<\/template>[\s\S]*<template #subtitle>/,
  );
  assert.match(
    awardManagement,
    /<TacticalPageHeader inline-actions>[\s\S]*<template #title>Manage Awards<\/template>[\s\S]*<template #subtitle>/,
  );
});
