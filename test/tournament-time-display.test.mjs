import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatCopenhagenTournamentTime,
  formatLocalTournamentDateTime,
  formatLocalTournamentZoneTime,
  isCopenhagenTimeZone,
  tournamentZoneAbbreviation,
} from "../utilities/tournamentTime.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const timeComponent = await read("../components/tournament/TournamentTime.vue");
const statRibbon = await read(
  "../components/tournament/TournamentStatRibbon.vue",
);
const checkInInfo = await read(
  "../components/tournament/TournamentCheckInInfo.vue",
);
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

test("the local display includes both date and time", () => {
  const value = formatLocalTournamentDateTime(
    "2026-10-10T12:00:00.000Z",
    "en-GB",
    "Europe/London",
  );
  assert.equal(value, "10 Oct 13:00");
});

test("Copenhagen automatically uses CEST in summer and CET in winter", () => {
  assert.match(
    formatCopenhagenTournamentTime(
      "2026-07-10T12:00:00.000Z",
      "en-GB",
      "Europe/London",
    ),
    /14:00 CEST$/,
  );
  assert.match(
    formatCopenhagenTournamentTime(
      "2026-01-10T13:00:00.000Z",
      "en-GB",
      "Europe/London",
    ),
    /14:00 CET$/,
  );
});

test("the Copenhagen tooltip includes the year when its date differs locally", () => {
  const value = formatCopenhagenTournamentTime(
    "2026-10-10T00:30:00.000Z",
    "en-GB",
    "America/Los_Angeles",
  );
  assert.match(value, /10 Oct 2026 02:30 CEST$/);
});

test("the reusable time is keyboard-focusable and touch-toggleable", () => {
  assert.match(timeComponent, /<FiveStackToolTip[^>]+as-child[^>]+tap-toggle/);
  assert.match(timeComponent, /<button\s+type="button"/);
  assert.match(timeComponent, /focus-visible:ring-2/);
  assert.match(timeComponent, /<time :datetime="date\.toISOString\(\)"/);
});

test("the local and Copenhagen labels are available to the shared component", () => {
  assert.equal(enLocale.common.time.local_time, "your local time");
  assert.match(enLocale.common.time.local_notice, /local timezone/i);
  assert.equal(enLocale.common.time.copenhagen, "Copenhagen");
});

test("the STARTS card shows date and clock, with the zone only in the tooltip", () => {
  assert.match(statRibbon, /kind: "start"/);
  assert.match(statRibbon, /<TournamentTime[^>]+display="date-time"/);
  // No always-visible "Shown in your local timezone (...)" line any more.
  assert.doesNotMatch(statRibbon, /local_notice/);
  assert.doesNotMatch(statRibbon, /localTimeZoneName/);
});

test("check-in opening, closing, and registration closing use the tooltip", () => {
  assert.match(checkInInfo, /:value="attendanceTimes\?\.opensAt"/);
  assert.ok(
    (checkInInfo.match(/:value="attendanceTimes\?\.closesAt"/g) ?? []).length >=
      2,
  );
  assert.doesNotMatch(checkInInfo, /local_notice/);
});

test("the tooltip carries the viewer's own zone abbreviation", () => {
  assert.match(timeComponent, /formatLocalTournamentZoneTime\(date\.value\)/);
  assert.match(timeComponent, /common\.time\.local_notice/);
  assert.match(timeComponent, /v-if="showCopenhagen"/);
});

test("the zone abbreviation follows daylight saving, never hardcoded", () => {
  assert.equal(
    formatLocalTournamentZoneTime(
      "2026-10-10T12:00:00.000Z",
      "en-GB",
      "Europe/Copenhagen",
    ),
    "10 Oct 14:00 CEST",
  );
  assert.equal(
    formatLocalTournamentZoneTime(
      "2026-12-10T13:00:00.000Z",
      "en-GB",
      "Europe/Copenhagen",
    ),
    "10 Dec 14:00 CET",
  );
  assert.equal(
    tournamentZoneAbbreviation("2026-07-01T12:00:00.000Z", "America/New_York"),
    "EDT",
  );
  // No common abbreviation: falls back to the offset rather than inventing one.
  assert.match(
    tournamentZoneAbbreviation("2026-07-01T12:00:00.000Z", "Asia/Dubai"),
    /^(GMT|UTC)\+4$|^GST$/,
  );
  assert.equal(isCopenhagenTimeZone("Europe/Copenhagen"), true);
  assert.equal(isCopenhagenTimeZone("Europe/London"), false);
});
