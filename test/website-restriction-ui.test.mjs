import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const app = read("app.vue");
const defaultLayout = read("layouts/default.vue");
const publicLayout = read("layouts/public.vue");
const chatLayout = read("layouts/chat.vue");
const topNav = read("layouts/components/TopNav.vue");
const appHeader = read("layouts/components/AppHeader.vue");
const notice = read("components/WebsiteRestrictionNotice.vue");
const restrictionStore = read("stores/WebsiteRestrictionStore.ts");
const sanction = read("components/SanctionPlayer.vue");
const button = read("components/ui/button/Button.vue");
const english = read("i18n/locales/en.json");

test("restriction notice is mounted by the active layout instead of before NuxtLayout", () => {
  const layoutStart = app.indexOf("<NuxtLayout>");
  const noticeSlot = app.indexOf('<template #website-restriction-notice>');
  const page = app.indexOf("<NuxtPage");

  assert.ok(layoutStart >= 0);
  assert.doesNotMatch(app.slice(0, layoutStart), /<WebsiteRestrictionNotice/);
  assert.ok(noticeSlot > layoutStart);
  assert.ok(page > noticeSlot);
  assert.equal((app.match(/<WebsiteRestrictionNotice/g) ?? []).length, 1);
  assert.match(app, /<WebsiteRestrictionNotice v-if="me" \/>/);
});

test("default navigation stays first and the restriction notice precedes page content", () => {
  const topNavMount = defaultLayout.indexOf('<TopNav v-if="!showLeftNav" />');
  const appHeaderMount = defaultLayout.indexOf(
    '<AppHeader class="px-6" v-if="showLeftNav" />',
  );
  const mainContent = defaultLayout.indexOf('<MainContent class="flex-1">');
  const noticeSlot = defaultLayout.indexOf(
    '<slot name="website-restriction-notice"></slot>',
  );
  const pageContent = defaultLayout.indexOf(
    '<ApplicationSettingsShell v-if="isApplicationSettings">',
  );

  assert.ok(topNavMount >= 0);
  assert.ok(appHeaderMount > topNavMount);
  assert.ok(mainContent > appHeaderMount);
  assert.ok(noticeSlot > mainContent);
  assert.ok(pageContent > noticeSlot);
  assert.match(topNav, /class="sticky top-0/);
  assert.match(appHeader, /sticky top-0 z-50/);
});

test("public and chat layouts keep the same single restriction notice visible", () => {
  const publicAlert = publicLayout.indexOf("<SystemAlertBanner />");
  const publicNotice = publicLayout.indexOf(
    '<slot name="website-restriction-notice"></slot>',
  );
  const publicPage = publicLayout.indexOf("<slot></slot>", publicNotice);
  assert.ok(publicNotice > publicAlert);
  assert.ok(publicPage > publicNotice);

  const chatNotice = chatLayout.indexOf(
    '<slot name="website-restriction-notice"></slot>',
  );
  const chatPage = chatLayout.indexOf("<slot />", chatNotice);
  assert.ok(chatNotice >= 0);
  assert.ok(chatPage > chatNotice);
  assert.match(chatLayout, /class="flex-1 min-h-0 overflow-hidden"/);
});

test("affected players get the required read-only and email-only appeal notice", () => {
  assert.match(notice, /v-if="store\.isRestricted"/);
  assert.match(notice, /ACCOUNT RESTRICTED/i);
  assert.match(notice, /read-only access/i);
  assert.match(notice, /info@deafcs\.net/);
  assert.match(notice, /reason/i);
  assert.match(notice, /permanent|expires/i);
  assert.doesNotMatch(notice, /support request|appeal form/i);
});

test("restriction state refreshes from the server, socket, and expiry timer", () => {
  assert.match(restrictionStore, /websiteRestrictionStatus/);
  assert.match(restrictionStore, /account:restriction-status/);
  assert.match(restrictionStore, /setTimeout\(\(\) => void refresh\(\)/);
  assert.match(restrictionStore, /fetchPolicy: "network-only"/);
});

test("administrator sanction UI supports independent and atomic combined restrictions", () => {
  assert.match(sanction, /website_restriction/);
  assert.match(english, /Also restrict website access \(Read-only\)/);
  assert.match(sanction, /also_restrict_website/);
  assert.match(sanction, /isSiteAdministrator/);
});

test("shared participation buttons explain and enforce the disabled state", () => {
  assert.match(button, /participation\?: boolean/);
  assert.match(button, /restrictionStore\.isRestricted/);
  assert.match(button, /Your account is restricted\./);
  assert.match(button, /"aria-disabled": "true"/);
});
