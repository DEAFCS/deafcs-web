import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(/\r\n/g, "\n");

describe("matches table status", () => {
  it("the Result cell is clipped and the status wraps inside it instead of spilling into Map", () => {
    const rowSource = read("components/player/PlayerMatchRow.vue");
    expect(rowSource.match(/result-cell flex min-w-0 overflow-hidden flex-col justify-center gap-(1|0\.5)/g)).toHaveLength(2);
    expect(rowSource.match(/class="result-status self-start"/g)).toHaveLength(2);
    expect(rowSource).toMatch(/\.result-cell :deep\(\.result-status\) \{[^}]*max-width: 100%;[^}]*white-space: normal;/);
    // The column track itself did not change (header and rows stay aligned).
    expect(rowSource).toContain("grid-cols-[2.5rem_5rem_6.75rem_8.5rem_minmax(4.5rem,1fr)");
    expect(read("components/player/PlayerMatchesTable.vue")).toContain("grid-cols-[2.5rem_5rem_6.75rem_8.5rem_minmax(4.5rem,1fr)");
  });
});

describe("map veto notifications and CT/T size", () => {
  it("the corner veto notification stays, the orange action popup for a veto is gone", () => {
    const corner = read("composables/useOffPageToasts.ts");
    expect(corner).toContain("matchmaking.toasts.your_veto_title");
    expect(corner).toContain("can_pick_map_veto");
    const actions = read("utilities/matchActionToasts.ts");
    expect(actions).not.toContain('add("map_veto")');
    expect(actions).not.toContain('add("region_veto")');
    expect(actions).toContain('export type MatchActionKind = "check_in";');
  });

  it("CT/T is a single row whatever the pool size", () => {
    const veto = read("components/match/overview/OverviewVeto.vue");
    expect(veto).toContain('aspectRatio: "4 / 1"');
    expect(veto).not.toMatch(/Math\.ceil\(this\.mapRows\.length \/ 3\)/);
    // Two wide choices, side by side.
    expect(veto).toContain("grid min-h-0 flex-1 grid-cols-2");
    // The map grid still wraps as before.
    expect(veto).toContain("w-[calc((100%_-_0.5rem)/2)]");
    expect(veto).toContain("sm:w-[calc((100%_-_1rem)/3)]");
  });
});
