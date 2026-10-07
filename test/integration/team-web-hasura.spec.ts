import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { bootContainerAndMigrate, runAsUser } from "../../../api-deafcs/test/utils/sql-test-db";
import { Fixtures } from "../../../api-deafcs/test/utils/fixtures";

// Boot only throwaway containers with the real local migration/metadata files.
// The child runs actual WEB component actions against this engine as each role.
const web = path.resolve(__dirname, "../..");
const api = path.resolve(web, "../api-deafcs");
const requireApi = createRequire(path.join(api, "package.json"));
const { GenericContainer, Wait } = requireApi("testcontainers");
requireApi("@nestjs/common").Logger.overrideLogger(false);

it("integrates Team WEB actions and Founded with disposable real Hasura", async () => {
  const db = await bootContainerAndMigrate("TeamWebIntegration");
  let engine: any;
  try {
    const fx = new Fixtures(db.postgres, 76561199720000000n);
    const siteAdmin = await fx.player("Local Site Admin");
    const stranger = await fx.player("Local Stranger");
    const roster = await fx.team(0);
    const secondAdmin = await fx.player("Second Admin");
    const captain = await fx.player("Captain");
    const ordinary = await fx.player("Ordinary");
    const coach = await fx.player("Coach");
    await runAsUser(db.postgres, roster.owner, "admin", async (query) => {
      for (const steam of [secondAdmin, captain, ordinary, coach]) {
        await query("INSERT INTO team_roster (team_id, player_steam_id, status, coach) VALUES ($1, $2, 'Benched', $3)", [roster.id, steam, steam === coach]);
      }
      await query("UPDATE team_roster SET role = 'Admin' WHERE team_id = $1 AND player_steam_id = $2", [roster.id, secondAdmin]);
      await query("UPDATE teams SET captain_steam_id = $2 WHERE id = $1", [roster.id, captain]);
    });
    const adminDelete = await fx.team(0);
    const ownerDelete = await fx.team(0);
    const lastAdmin = await fx.team(0);
    const legacy = await fx.team(0);
    await db.postgres.query("UPDATE teams SET created_at = NULL WHERE id = $1", [legacy.id]);
    const container = db.container!;
    engine = await new GenericContainer("hasura/graphql-engine:v2.48.5.cli-migrations-v3")
      .withEnvironment({
        HASURA_GRAPHQL_DATABASE_URL: `postgres://${container.getUsername()}:${container.getPassword()}@host.docker.internal:${container.getPort()}/${container.getDatabase()}`,
        HASURA_GRAPHQL_ADMIN_SECRET: "metadata-test",
        HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES: "true",
        HASURA_GRAPHQL_ACTIONS_HOOK: "http://host.docker.internal:3000",
        HASURA_GRAPHQL_EVENT_HOOK: "http://host.docker.internal:3000/events",
      })
      .withBindMounts([{ source: path.join(api, "hasura/metadata"), target: "/hasura-metadata", mode: "ro" }])
      .withExposedPorts(8080).withWaitStrategy(Wait.forHttp("/healthz", 8080).forStatusCode(200)).start();
    const endpoint = `http://${engine.getHost()}:${engine.getMappedPort(8080)}`;
    expect(new URL(endpoint).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    const output = execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "test/component/team-local-hasura.spec.ts"], {
      cwd: web,
      env: { ...process.env, DEAFCS_TEAM_LOCAL_FIXTURE: JSON.stringify({ endpoint, siteAdmin, stranger, roster, secondAdmin, captain, ordinary, coach, adminDelete, ownerDelete, lastAdmin, legacy }) },
      timeout: 120000,
      encoding: "utf8",
    });
    expect(output).toContain("passed");
    console.log(output);
  } finally {
    await engine?.stop();
    await db.stop();
  }
});
