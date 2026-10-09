import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const store = readFileSync(path.resolve(__dirname, "../../stores/MatchLobbyStore.ts"), "utf8");
const block = store.slice(
  store.indexOf("const subscribeToChatTournaments"),
  store.indexOf("const subscribeToManagingMatches"),
);

// Tournament Chat is not opened to every logged-in viewer: the hub lists a
// tournament only for its participants and its staff.
describe("tournament chat access", () => {
  it("is limited to participants and organizers, not every logged-in viewer", () => {
    expect(block).toMatch(/joined_tournament: \{ _eq: true \}/);
    expect(block).toMatch(/is_organizer: \{ _eq: true \}/);
    expect(block).toContain("NOT_LEAGUE_TOURNAMENT");
  });

  it("stays reachable for 24 hours after the tournament finishes", () => {
    expect(block).toContain("24 * 60 * 60 * 1000");
    expect(block).toMatch(/status: \{ _eq: e_tournament_status_enum\.Finished \}/);
    expect(block).toMatch(/finished_at: \{ _gte: chatGracePeriodCutoff \}/);
  });
});
