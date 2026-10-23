import { describe, expect, it } from "vitest";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import { resolveMatchPlayerAvatarUrl } from "~/utilities/teamRosterOverride";

// Port of 5stackgg/web f87f0b26 (#862): uploads the API can resize get ?w=,
// everything else is left alone (the API refuses other widths and paths).
describe("resolveAvatarUrl width", () => {
  it("asks the API for a resized upload", () => {
    expect(
      resolveAvatarUrl("avatars/tournaments/abc-123.png", "api.deafcs.net", 1024),
    ).toBe("https://api.deafcs.net/avatars/tournaments/abc-123.png?w=1024");
    expect(
      resolveAvatarUrl("/avatars/teams/t.webp", "api.deafcs.net", 64),
    ).toBe("https://api.deafcs.net/avatars/teams/t.webp?w=64");
    expect(
      resolveAvatarUrl("avatars/roster-players/p.png", "api.deafcs.net", 128),
    ).toBe("https://api.deafcs.net/avatars/roster-players/p.png?w=128");
  });

  it("keeps the original without a width (edit forms need it)", () => {
    expect(
      resolveAvatarUrl("avatars/tournaments/abc-123.png", "api.deafcs.net"),
    ).toBe("https://api.deafcs.net/avatars/tournaments/abc-123.png");
  });

  it("leaves Steam avatars and other paths untouched", () => {
    const steam = "https://avatars.steamstatic.com/abc_full.jpg";
    expect(resolveAvatarUrl(steam, "api.deafcs.net", 64)).toBe(steam);
    expect(
      resolveAvatarUrl("avatars/other/x.png", "api.deafcs.net", 64),
    ).toBe("https://api.deafcs.net/avatars/other/x.png");
    expect(
      resolveAvatarUrl("avatars/teams/x.png?v=2", "api.deafcs.net", 64),
    ).toBe("https://api.deafcs.net/avatars/teams/x.png?v=2");
  });
});

describe("resolveMatchPlayerAvatarUrl width (DEAFCS helper)", () => {
  it("passes the width through and keeps the old result without one", () => {
    const player = { steam_id: "1", avatar_url: "avatars/players/p.png" };
    expect(
      resolveMatchPlayerAvatarUrl(null, null, player, "1", "api.deafcs.net", 64),
    ).toBe("https://api.deafcs.net/avatars/players/p.png?w=64");
    expect(
      resolveMatchPlayerAvatarUrl(null, null, player, "1", "api.deafcs.net"),
    ).toBe("https://api.deafcs.net/avatars/players/p.png");
  });
});
