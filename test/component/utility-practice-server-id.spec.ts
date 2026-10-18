import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readUtilityPracticeSession,
  type UtilityPracticeSession,
} from "~/types/utility";

// The Pracc panel's Server console never opened: it read the server off
// session.match, and the matches select hides practice matches from every
// role, so that relationship was always null. The id now comes from the
// staff-only server_id computed field on the session itself.
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const session = (overrides: Partial<UtilityPracticeSession>) =>
  ({
    id: "s1",
    match_id: "m1",
    server_id: null,
    host_steam_id: "1",
    host: null,
    team_id: null,
    map_name: "de_mirage",
    status: "Ready",
    ...overrides,
  }) as UtilityPracticeSession;

describe("practice session server id", () => {
  it("reads the server from the session's own server_id", () => {
    expect(
      readUtilityPracticeSession(session({ server_id: "srv-1" })).serverId,
    ).toBe("srv-1");
  });

  it("has no server for anyone the field answers null to", () => {
    expect(
      readUtilityPracticeSession(session({ server_id: null })).serverId,
    ).toBeNull();
    expect(readUtilityPracticeSession(null).serverId).toBeNull();
  });

  it("no longer asks for the hidden match relationship", () => {
    const fields = read("graphql/utilityGraphql.ts");
    const block = fields.slice(
      fields.indexOf("export const utilityPracticeSessionFields"),
    );
    const selection = block.slice(0, block.indexOf("} as const;"));

    expect(selection).toMatch(/\n\s*server_id: true,/);
    expect(selection).not.toMatch(/match: \{ server_id: true \}/);
  });

  it("shows the console section only when there is a server to drive", () => {
    const panel = read("components/utility/UtilityPracticeSessionPanel.vue");

    expect(panel).toMatch(/<template v-if="canOperate && serverId">/);
    expect(panel).toMatch(/<RconCommander\s+v-if="serverId"/);
  });
});
