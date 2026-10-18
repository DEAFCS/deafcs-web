import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  joinablePracticeFor,
  practiceJoinPath,
  type FriendPracticeSession,
} from "~/utilities/friendPractice";

// Join Pracc from the friends list (DEAFCS). The button only appears for a
// live session a link could open, and only ever goes through that link's
// door, so the API's join keeps deciding access, capacity and expiry.
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const ME = "76561198000000001";
const FRIEND = "76561198000000002";

const session = (over: Partial<FriendPracticeSession> = {}): FriendPracticeSession => ({
  id: "s1",
  host_steam_id: FRIEND,
  map_name: "de_mirage",
  status: "Ready",
  access: "Friends",
  is_open: false,
  invite_code: "ABC123",
  ...over,
});

describe("joinablePracticeFor", () => {
  it.each(["Open", "Friends"])("offers a friend's live %s session", (access) => {
    expect(joinablePracticeFor(FRIEND, [session({ access })], ME)?.id).toBe("s1");
  });

  it.each(["Invite", "Private"])("never offers a %s session, even if it is visible", (access) => {
    expect(joinablePracticeFor(FRIEND, [session({ access })], ME)).toBeNull();
  });

  it.each(["Starting", "Ended", "Failed", null])(
    "only offers a Ready session, not %s",
    (status) => {
      expect(joinablePracticeFor(FRIEND, [session({ status })], ME)).toBeNull();
    },
  );

  it("does not offer someone else's session on this friend's row", () => {
    expect(
      joinablePracticeFor(FRIEND, [session({ host_steam_id: "76561198000000099" })], ME),
    ).toBeNull();
  });

  it("never offers a player their own session", () => {
    expect(joinablePracticeFor(ME, [session({ host_steam_id: ME })], ME)).toBeNull();
  });

  it("needs the invite code and map the link is made of", () => {
    expect(joinablePracticeFor(FRIEND, [session({ invite_code: null })], ME)).toBeNull();
    expect(joinablePracticeFor(FRIEND, [session({ map_name: null })], ME)).toBeNull();
  });

  it("reads an old row's open flag when access is missing", () => {
    expect(joinablePracticeFor(FRIEND, [session({ access: null, is_open: true })], ME)?.id).toBe("s1");
    // A closed old row reads as Friends, which a link still opens.
    expect(joinablePracticeFor(FRIEND, [session({ access: null, is_open: false })], ME)?.id).toBe("s1");
  });

  it("compares steam ids as strings", () => {
    expect(joinablePracticeFor(Number(FRIEND.slice(0, 15)), [session()], ME)).toBeNull();
    expect(joinablePracticeFor(FRIEND, [session({ host_steam_id: FRIEND })], Number(1))?.id).toBe("s1");
  });
});

describe("practiceJoinPath", () => {
  it("is the same door an invite link opens", () => {
    expect(practiceJoinPath(session())).toBe("/utility/de_mirage?practice=ABC123");
  });

  it("escapes what it puts in the URL", () => {
    expect(practiceJoinPath(session({ map_name: "workshop/123", invite_code: "a b" }))).toBe(
      "/utility/workshop%2F123?practice=a%20b",
    );
  });
});

describe("friends list wiring", () => {
  it("offers Join Pracc on a friend's row only, through the link", () => {
    const item = read("components/matchmaking-lobby/FriendListItem.vue");

    expect(item).toMatch(/isFriend\.value\s*\?\s*joinablePracticeFor\(/);
    expect(item).toMatch(/navigateTo\(practiceJoinPath\(session\)\)/);
    expect(item).toMatch(/v-if="!showBanner && joinablePractice"/);
    // Never starts or books anything from here.
    expect(item).not.toMatch(/startUtilityPractice|start_utility_practice/);
  });

  it("subscribes once for the list to live Open/Friends sessions of other hosts", () => {
    const composable = read("composables/useFriendPracticeSessions.ts");

    expect(composable).toMatch(/variables: \{ status: "Ready", access: \["Open", "Friends"\], me \}/);
    expect(composable).toMatch(/host_steam_id: \{ _neq: \$\("me", "bigint!"\) \}/);
    // Asks for nothing that would let a viewer connect without joining.
    expect(composable).not.toMatch(/connection_string|connection_link|server_id/);
  });

  it("keeps Invite Friend and the session link in the panel", () => {
    const panel = read("components/utility/UtilityPracticeSessionPanel.vue");

    expect(panel).toMatch(/\?practice=\$\{code\}/);
    expect(panel).toMatch(/inviteUtilityPracticeMutation|invite/);
  });
});
