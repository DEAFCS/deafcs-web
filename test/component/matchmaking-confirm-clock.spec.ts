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

import { localServerTime } from "../../utilities/matchmakingDeadline";

describe("search timer clock correction", () => {
  const JOINED = iso(SERVER_NOW - 1_000);

  // The timer shows (device now - local join time); a device whose clock is
  // off by `offset` must still read the same elapsed time as the server does.
  const elapsedMs = (offset: number, afterMs = 0) => {
    const receivedAt = SERVER_NOW + offset;
    const joined = localServerTime(JOINED, { serverNow: iso(SERVER_NOW), receivedAt })!;
    return receivedAt + afterMs - joined;
  };

  it("starts at the real elapsed time on a correct clock", () => {
    expect(elapsedMs(0)).toBe(1_000);
  });

  it("does not start at 55 seconds on a clock a minute ahead", () => {
    expect(elapsedMs(60_000)).toBe(1_000);
  });

  it("does not start at a negative time on a clock behind", () => {
    expect(elapsedMs(-20_000)).toBe(1_000);
  });

  it("keeps counting at normal speed", () => {
    expect(elapsedMs(60_000, 5_000)).toBe(6_000);
  });

  it("falls back to the plain time when the server sent no clock", () => {
    expect(localServerTime(JOINED, undefined)).toBe(Date.parse(JOINED));
    expect(localServerTime(undefined, undefined)).toBeUndefined();
  });
});

describe("search timer wiring", () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("the search timer and wait text use the corrected join time", () => {
    const view = read("components/matchmaking/Matchmaking.vue");
    expect(view).toContain("localServerTime(details?.joinedAt, details)");
    expect(view).toContain("Math.min(new Date().getTime(), localJoinedAt)");
    expect(view).not.toContain("new Date(this.matchMakingQueueDetails.joinedAt)");
  });

  it("each queue details update is stamped with its arrival time", () => {
    expect(read("web-sockets/Socket.ts")).toContain("received.details.receivedAt = Date.now();");
  });
});
