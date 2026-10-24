import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { awardNotificationPath } from "../utilities/awardNotification.ts";

const AWARD = "e729f4e4-7cf5-41e7-9fe6-5b00e864ab94";

test("an AwardGranted notification opens its award", () => {
  assert.equal(
    awardNotificationPath(`${AWARD}/player_of_the_month:2026-09`),
    `/awards/${AWARD}`,
  );
  assert.equal(
    awardNotificationPath(`${AWARD}/tournament:abc:champion`),
    `/awards/${AWARD}`,
  );
});

test("anything else falls back to the awards page", () => {
  assert.equal(awardNotificationPath(null), "/awards");
  assert.equal(awardNotificationPath(""), "/awards");
  assert.equal(awardNotificationPath("not-a-uuid/key"), "/awards");
});

test("the bell and push clicks both route AwardGranted", async () => {
  const item = await readFile(
    new URL("../components/notification/NotificationItem.vue", import.meta.url),
    "utf8",
  );
  const plugin = await readFile(
    new URL("../plugins/chatNotificationClick.client.ts", import.meta.url),
    "utf8",
  );
  for (const source of [item, plugin]) {
    assert.match(source, /type === "AwardGranted"/);
    assert.match(source, /awardNotificationPath\(/);
  }
});
