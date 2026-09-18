import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const notice = read("components/WebsiteRestrictionNotice.vue");
const restrictionStore = read("stores/WebsiteRestrictionStore.ts");
const sanction = read("components/SanctionPlayer.vue");
const button = read("components/ui/button/Button.vue");
const english = read("i18n/locales/en.json");

test("affected players get the required read-only and email-only appeal notice", () => {
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
