import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actionSource = await readFile(
  new URL("../components/match/MatchActions.vue", import.meta.url),
  "utf8",
);

const localeFiles = [
  "ar_SA",
  "da_DK",
  "de_DE",
  "en",
  "es_ES",
  "fr_FR",
  "it_IT",
  "ja_JP",
  "ko_KR",
  "pl_PL",
  "pt_BR",
  "ru_RU",
  "sv_SE",
  "tr_TR",
  "uk_UA",
  "zh_Hans",
  "zh_Hant",
];

const getPath = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);

for (const locale of localeFiles) {
  const source = await readFile(
    new URL(`../i18n/locales/${locale}.json`, import.meta.url),
    "utf8",
  );
  const translations = JSON.parse(source);

  assert.notEqual(
    getPath(translations, "match.actions.call_support"),
    "Call for Support",
  );
  if (locale === "en") {
    assert.equal(
      getPath(translations, "match.actions.call_support"),
      "Contact Support",
    );
  }
  assert.doesNotMatch(source, /Call for Support|Call Support/i);
}

assert.match(actionSource, /v-if="canCancelMatch"/);
assert.doesNotMatch(actionSource, /v-if="match\.can_cancel"/);
assert.match(actionSource, /draft\?\.is_organizer === true/);
assert.match(actionSource, /match\.is_tournament_match !== true/);
assert.match(actionSource, /description: error\?\.message/);

console.log("match cancellation wording and UI guard checks passed");
