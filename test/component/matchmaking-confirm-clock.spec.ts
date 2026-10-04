import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { localConfirmationExpiry } from "../../utilities/matchmakingDeadline";

const SERVER_NOW = Date.parse("2026-10-04T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

// A ready check lasts 30 seconds on the server.
const confirmation = (deviceClockOffsetMs: number) => ({
  expiresAt: iso(SERVER_NOW + 30_000),
  serverNow: iso(SERVER_NOW),
  // What this device's own clock read when the update arrived.
  receivedAt: SERVER_NOW + deviceClockOffsetMs,
});

describe("localConfirmationExpiry", () => {
  it("gives the full 30 seconds on a correct clock", () => {
    const c = confirmation(0);
    expect(localConfirmationExpiry(c)! - c.receivedAt).toBe(30_000);
  });

  it("still gives 30 seconds when the device clock is 45 seconds ahead", () => {
    const c = confirmation(45_000);
    // Without the correction the check looks expired 15 seconds ago.
    expect(Date.parse(c.expiresAt) - c.receivedAt).toBe(-15_000);
    expect(localConfirmationExpiry(c)! - c.receivedAt).toBe(30_000);
  });

  it("still gives 30 seconds when the device clock is 20 seconds behind", () => {
    const c = confirmation(-20_000);
    expect(localConfirmationExpiry(c)! - c.receivedAt).toBe(30_000);
  });

  it("keeps the deadline fixed when the update is re-sent a few seconds later", () => {
    const first = confirmation(45_000);
    const resent = {
      expiresAt: first.expiresAt,
      serverNow: iso(SERVER_NOW + 8_000),
      receivedAt: first.receivedAt + 8_000,
    };
    expect(localConfirmationExpiry(resent)).toBe(localConfirmationExpiry(first));
  });

  it("falls back to the plain deadline from an older server (no serverNow)", () => {
    const expiresAt = iso(SERVER_NOW + 30_000);
    expect(localConfirmationExpiry({ expiresAt })).toBe(Date.parse(expiresAt));
    expect(localConfirmationExpiry({ expiresAt, receivedAt: 1 })).toBe(Date.parse(expiresAt));
  });

  it("returns nothing for a missing or invalid deadline", () => {
    expect(localConfirmationExpiry(undefined)).toBeUndefined();
    expect(localConfirmationExpiry({})).toBeUndefined();
    expect(localConfirmationExpiry({ expiresAt: "nope" })).toBeUndefined();
  });
});

describe("accept popup wiring", () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("the popup counts down on the corrected deadline, not the raw device clock", () => {
    const popup = read("components/matchmaking/MatchmakingConfirm.vue");
    expect(popup).toContain("localConfirmationExpiry(this.confirmation)");
    expect(popup).toContain("const expiresAt = this.localExpiresAt;");
    // No remaining direct comparison of the raw server deadline with Date.now().
    expect(popup).not.toContain("new Date(this.confirmation.expiresAt).getTime()");
  });

  it("stamps each ready check update with its arrival time", () => {
    const socket = read("web-sockets/Socket.ts");
    expect(socket).toContain("received.confirmation.receivedAt = Date.now();");
  });
});
