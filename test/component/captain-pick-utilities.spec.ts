import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { e_match_types_enum } from "~/generated/zeus";
import {
  CAPTAIN_PICK_MODE_KEY,
  buildMatchmakingModes,
  canQueueMode,
  joinQueuePayload,
  playersInQueue,
  regionStatsKey,
} from "~/utilities/matchmakingModes";
import {
  CAPTAIN_PICK_ENABLED_SETTING,
  CAPTAIN_PICK_SECONDS_SETTING,
  DEFAULT_CAPTAIN_PICK_SECONDS,
  MAX_CAPTAIN_PICK_SECONDS,
  MIN_CAPTAIN_PICK_SECONDS,
  parseCaptainPickEnabled,
  parseCaptainPickSeconds,
} from "~/utilities/captainPickSettings";
import {
  isCaptainPickInProgress,
  isMyCaptainPickTurn,
  localCaptainPickDeadline,
  pendingReadyCheck,
} from "~/utilities/captainPickDraft";
import { MATCH_TYPE_RGB } from "~/utilities/matchTypeColors";
import { makeDraft } from "./fixtures/captainPick";

const allOn = { isTypeEnabled: () => true, captainPickEnabled: true };

describe("matchmaking modes", () => {
  it("lists 5v5, 5v5 Captain Pick, 2v2, 1v1 in that order", () => {
    expect(buildMatchmakingModes(allOn).map((mode) => mode.key)).toEqual([
      "Competitive",
      "CompetitiveCaptainPick",
      "Wingman",
      "Duel",
    ]);
  });

  it("plays Captain Pick as Competitive, never a new match type", () => {
    const captainPick = buildMatchmakingModes(allOn)[1];
    expect(captainPick).toEqual({
      key: CAPTAIN_PICK_MODE_KEY,
      type: e_match_types_enum.Competitive,
      variant: "CaptainPick",
    });
    expect(Object.values(e_match_types_enum)).not.toContain(
      CAPTAIN_PICK_MODE_KEY,
    );
    // Not registered as a match type for badges / history filters either.
    expect(MATCH_TYPE_RGB).not.toHaveProperty(CAPTAIN_PICK_MODE_KEY);
  });

  it("hides Captain Pick while its switch is off", () => {
    expect(
      buildMatchmakingModes({ ...allOn, captainPickEnabled: false }).map(
        (mode) => mode.key,
      ),
    ).toEqual(["Competitive", "Wingman", "Duel"]);
  });

  it("keeps Captain Pick independent of the Standard 5v5 switch", () => {
    expect(
      buildMatchmakingModes({
        isTypeEnabled: (type) => type !== e_match_types_enum.Competitive,
        captainPickEnabled: true,
      }).map((mode) => mode.key),
    ).toEqual(["CompetitiveCaptainPick", "Wingman", "Duel"]);
  });

  it("sends Standard modes exactly as before and Captain Pick with its variant", () => {
    const [standard, captainPick, wingman, duel] = buildMatchmakingModes(allOn);

    expect(joinQueuePayload(standard, ["EU"])).toStrictEqual({
      type: "Competitive",
      regions: ["EU"],
    });
    expect(joinQueuePayload(wingman, ["EU"])).toStrictEqual({
      type: "Wingman",
      regions: ["EU"],
    });
    expect(joinQueuePayload(duel, ["EU"])).toStrictEqual({
      type: "Duel",
      regions: ["EU"],
    });
    expect(joinQueuePayload(captainPick, ["EU", "US"])).toStrictEqual({
      type: "Competitive",
      regions: ["EU", "US"],
      variant: "CaptainPick",
    });
  });

  it("lets only solo players queue Captain Pick, and leaves party rules alone", () => {
    const [standard, captainPick, wingman, duel] = buildMatchmakingModes(allOn);

    expect(canQueueMode(captainPick, 1, 5)).toBe(true);
    for (const size of [2, 3, 5]) {
      expect(canQueueMode(captainPick, size, 5)).toBe(false);
    }
    expect(canQueueMode(standard, 5, 5)).toBe(true);
    expect(canQueueMode(standard, 3, 2)).toBe(false);
    expect(canQueueMode(wingman, 2, 5)).toBe(true);
    expect(canQueueMode(wingman, 3, 5)).toBe(false);
    expect(canQueueMode(duel, 1, 5)).toBe(true);
    expect(canQueueMode(duel, 2, 5)).toBe(false);
  });
});

describe("queue counts", () => {
  const stats = {
    EU: {
      Competitive: [
        { index: 0, size: 3 },
        { index: 1, size: 1 },
      ],
      CompetitiveCaptainPick: [
        { index: 0, size: 1 },
        { index: 1, size: 1 },
      ],
      Wingman: [{ index: 0, size: 2 }],
      Duel: [],
    },
    US: {
      // Lobby 0 also searching US: counted once.
      Competitive: [{ index: 0, size: 3 }],
      CompetitiveCaptainPick: [{ index: 2, size: 1 }],
    },
  };

  it("maps each card to its own region-stats entry", () => {
    const [standard, captainPick, wingman, duel] = buildMatchmakingModes(allOn);
    expect(regionStatsKey(standard)).toBe("Competitive");
    expect(regionStatsKey(captainPick)).toBe("CompetitiveCaptainPick");
    expect(regionStatsKey(wingman)).toBe("Wingman");
    expect(regionStatsKey(duel)).toBe("Duel");
  });

  it("never mixes 5v5 and Captain Pick counts", () => {
    const regions = ["EU", "US"];
    expect(playersInQueue(stats, "Competitive", regions)).toBe(4);
    expect(playersInQueue(stats, "CompetitiveCaptainPick", regions)).toBe(3);
    expect(playersInQueue(stats, "Wingman", regions)).toBe(2);
    expect(playersInQueue(stats, "Duel", regions)).toBe(0);
  });

  it("only counts the regions asked for", () => {
    expect(playersInQueue(stats, "CompetitiveCaptainPick", ["EU"])).toBe(2);
    expect(playersInQueue(stats, "CompetitiveCaptainPick", [])).toBe(0);
  });
});

describe("Captain Pick settings", () => {
  it("uses the API's setting keys and bounds", () => {
    expect(CAPTAIN_PICK_ENABLED_SETTING).toBe(
      "public.matchmaking_competitive_captain_pick",
    );
    expect(CAPTAIN_PICK_SECONDS_SETTING).toBe(
      "public.matchmaking_captain_pick_seconds",
    );
    expect(DEFAULT_CAPTAIN_PICK_SECONDS).toBe(30);
    expect(MIN_CAPTAIN_PICK_SECONDS).toBe(10);
    expect(MAX_CAPTAIN_PICK_SECONDS).toBe(120);
  });

  it("is off unless exactly true", () => {
    expect(parseCaptainPickEnabled(undefined)).toBe(false);
    expect(parseCaptainPickEnabled(null)).toBe(false);
    expect(parseCaptainPickEnabled("true")).toBe(true);
    for (const value of ["false", "", "TRUE", "1"]) {
      expect(parseCaptainPickEnabled(value)).toBe(false);
    }
  });

  it("reads the timer like the API does", () => {
    expect(parseCaptainPickSeconds(undefined)).toBe(30);
    expect(parseCaptainPickSeconds("")).toBe(30);
    expect(parseCaptainPickSeconds("abc")).toBe(30);
    expect(parseCaptainPickSeconds("45")).toBe(45);
    expect(parseCaptainPickSeconds("5")).toBe(10);
    expect(parseCaptainPickSeconds("500")).toBe(120);
  });

  it("the settings page saves the exact keys with the same bounds", () => {
    const page = readFileSync(
      "pages/settings/application/matchmaking.vue",
      "utf8",
    );
    expect(page).toContain("CAPTAIN_PICK_ENABLED_SETTING");
    expect(page).toContain('name="public.matchmaking_captain_pick_seconds"');
    expect(page).toContain("name: CAPTAIN_PICK_SECONDS_SETTING");
    expect(page).toMatch(/\.min\(\s*MIN_PICK_SECONDS/);
    expect(page).toMatch(/\.max\(\s*MAX_PICK_SECONDS/);
    expect(page).toContain(".default(DEFAULT_CAPTAIN_PICK_SECONDS)");
    // A timer the API would clamp is never saved.
    expect(page).toContain("validateField(");
  });
});

describe("draft state helpers", () => {
  it("only a committed draft replaces the ready check", () => {
    const readyCheck = { matchId: undefined, confirmed: 4, players: 10 };
    expect(pendingReadyCheck(readyCheck)).toBe(readyCheck);
    expect(pendingReadyCheck({ ...readyCheck, matchId: "m" })).toBeNull();
    expect(
      pendingReadyCheck({ ...readyCheck, captainPick: makeDraft() }),
    ).toBeNull();
    expect(pendingReadyCheck(undefined)).toBeNull();
  });

  it("knows whose turn it is from the server state", () => {
    const draft = makeDraft();
    expect(isMyCaptainPickTurn(draft, draft.pickingCaptainSteamId)).toBe(true);
    expect(isMyCaptainPickTurn(draft, draft.captains[2])).toBe(false);
    expect(isMyCaptainPickTurn(draft, "3")).toBe(false);
    expect(
      isMyCaptainPickTurn(
        { ...draft, phase: "CreatingMatch", pickIndex: null },
        draft.pickingCaptainSteamId,
      ),
    ).toBe(false);
  });

  it("is in progress until the match exists", () => {
    expect(isCaptainPickInProgress(makeDraft())).toBe(true);
    expect(isCaptainPickInProgress(makeDraft({ phase: "CreatingMatch" }))).toBe(
      true,
    );
    expect(
      isCaptainPickInProgress(
        makeDraft({ phase: "MatchCreated", matchId: "m" }),
      ),
    ).toBe(false);
    expect(isCaptainPickInProgress(null)).toBe(false);
  });

  it("shows the server deadline on this device's clock", () => {
    // Device clock 5s behind the server: the same 20s remain.
    const draft = makeDraft({
      serverNow: "2026-09-29T20:00:10.000Z",
      deadline: "2026-09-29T20:00:30.000Z",
    });
    const receivedAt = new Date("2026-09-29T20:00:05.000Z").getTime();
    expect(localCaptainPickDeadline(draft, receivedAt)).toBe(
      "2026-09-29T20:00:25.000Z",
    );
    expect(
      localCaptainPickDeadline({ ...draft, deadline: null }, receivedAt),
    ).toBeNull();
  });
});
