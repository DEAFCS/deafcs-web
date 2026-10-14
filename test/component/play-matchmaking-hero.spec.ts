import { describe, expect, it } from "vitest";
import {
  heroShape,
  heroState,
  seatLayout,
  type HeroInputs,
} from "../../components/play/matchmakingHero";

const base: HeroInputs = {
  matchmakingEnabled: true,
  roleAllowed: true,
  isGuest: false,
  isBanned: false,
  hasCooldown: false,
  isRestricted: false,
  inCaptainPick: false,
  hasConfirmation: false,
  hasMatch: false,
  isSearching: false,
  noRegions: false,
  isMember: false,
};

describe("hero seats (DEAFCS party rules)", () => {
  it("never fills the other side: no in-house matches", () => {
    expect(seatLayout(10, 10)).toEqual({
      perSide: 5,
      mine: 5,
      overflow: 5,
      theirs: 0,
    });
  });

  it("takes the mode's own limit: Captain Pick solo, the Competitive cap", () => {
    expect(seatLayout(10, 2, 1)).toMatchObject({ mine: 1, overflow: 1 });
    expect(seatLayout(10, 4, 3)).toMatchObject({ mine: 3, overflow: 1 });
    expect(seatLayout(4, 2, 2)).toMatchObject({ mine: 2, overflow: 0 });
    expect(seatLayout(2, 0, 1)).toMatchObject({ perSide: 1, mine: 0 });
  });
});

describe("hero state (DEAFCS order)", () => {
  it("is never hidden: guests and closed matchmaking still see the picker", () => {
    expect(heroState({ ...base, isGuest: true, matchmakingEnabled: false })).toBe(
      "guest",
    );
    expect(heroState({ ...base, matchmakingEnabled: false })).toBe("closed");
    expect(heroShape("closed")).toBe("picker");
  });

  it("verification outranks everything a signed-in player sees", () => {
    expect(
      heroState({
        ...base,
        roleAllowed: false,
        matchmakingEnabled: false,
        isMember: true,
        isBanned: true,
      }),
    ).toBe("unverified");
  });

  it("a party member hears about the leader before the closed notice", () => {
    expect(
      heroState({ ...base, isMember: true, matchmakingEnabled: false }),
    ).toBe("member");
  });

  it("a committed Captain Pick draft outranks the ready check and search", () => {
    const state = heroState({
      ...base,
      inCaptainPick: true,
      hasConfirmation: true,
      isSearching: true,
    });
    expect(state).toBe("captain-pick");
    expect(heroShape(state)).toBe("match");
  });

  it("match > ready check > search, as upstream", () => {
    expect(heroState({ ...base, hasConfirmation: true, hasMatch: true })).toBe(
      "match",
    );
    expect(heroState({ ...base, hasConfirmation: true, isSearching: true })).toBe(
      "found",
    );
    expect(heroShape("found")).toBe("search");
    expect(heroState({ ...base, isSearching: true, isRestricted: true })).toBe(
      "searching",
    );
    expect(heroState({ ...base, isRestricted: true })).toBe("restricted");
    expect(heroState({ ...base, noRegions: true })).toBe("no-region");
    expect(heroState(base)).toBe("idle");
  });
});
