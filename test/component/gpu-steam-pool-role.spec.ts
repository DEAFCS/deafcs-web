import { readFileSync } from "node:fs";
import path from "node:path";
import { print } from "graphql";
import { describe, expect, it } from "vitest";
import { Zeus } from "~/generated/zeus";
import { generateQuery } from "~/graphql/graphqlGen";
import { gpuSteamAccountsWhere } from "~/utilities/gpuSteamAccounts";

// The Steam Presence bot (role 'friends') sits in steam_accounts next to the
// GPU render accounts. The GPU Nodes page and the left nav's GPU pool badge
// list and count the role 'gpu' rows only, so the bot never shows up as a
// render account (and cannot be deleted from the GPU pool sheet).
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const compact = (s: string) => s.replace(/\s+/g, "");

describe("GPU Steam pool role filter", () => {
  it("filters on role gpu", () => {
    expect(gpuSteamAccountsWhere).toEqual({ role: { _eq: "gpu" } });
  });

  it("prints the GPU Nodes subscription with the role filter", () => {
    const document = Zeus("subscription", {
      steam_accounts: [
        {
          where: gpuSteamAccountsWhere,
          order_by: [{ created_at: "asc" as any }],
        },
        { id: true, username: true },
      ],
    } as any);
    expect(compact(document)).toContain(
      'steam_accounts(where:{role:{_eq:"gpu"}},order_by:[{created_at:asc}])',
    );
  });

  it("prints the left nav GPU pool query with the role filter", () => {
    const document = print(
      generateQuery({
        steam_accounts: [{ where: gpuSteamAccountsWhere }, { id: true }],
      }),
    );
    expect(compact(document)).toContain(
      'steam_accounts(where:{role:{_eq:"gpu"}})',
    );
  });

  it("uses the filter for every steam_accounts read on the GPU pages", () => {
    const page = compact(read("pages/gpu-nodes/index.vue"));
    expect(page).toContain("steam_accounts:[{where:gpuSteamAccountsWhere,");
    const nav = compact(read("layouts/components/LeftNav.vue"));
    expect(nav).toContain(
      "steam_accounts:[{where:gpuSteamAccountsWhere},{id:true}]",
    );
    for (const source of [page, nav]) {
      expect(source.match(/steam_accounts:\[/g)).toHaveLength(1);
    }
  });
});
