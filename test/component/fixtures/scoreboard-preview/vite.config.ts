import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { createRequire } from "node:module";

const repo = path.resolve(__dirname, "../../../..");
const tailwindConfig = createRequire(import.meta.url)(path.join(repo, "tailwind.config.js"));
export default defineConfig({
  root: __dirname,
  publicDir: path.join(repo, "public"),
  plugins: [vue()],
  resolve: { alias: [
    // Only service-backed leaf widgets are replaced. The scoreboard, lineup
    // tables, data calculations, tabs and responsive wrappers are real.
    { find: /(?:.*\/)?(?:PlayerDisplay|PlayerStatusDisplay|PlayerMatchClipsButton|MultiKillDrilldown|RenderHighlightForPlayerDialog|AssignPlayerToLineup|PlayerElo|PlayerFaceitRank|TimezoneFlag|SanctionStatusBadge)\.vue$/, replacement: path.resolve(__dirname, "Leaf.vue") },
    { find: "~", replacement: repo }, { find: "@", replacement: repo },
  ] },
  css: { postcss: { plugins: [
    tailwindcss({ ...tailwindConfig, content: [path.join(repo, "components/**/*.vue").replaceAll("\\", "/"), path.join(__dirname, "*.vue").replaceAll("\\", "/")] }),
    autoprefixer(),
  ] } },
  server: { host: "127.0.0.1", port: 4176, strictPort: true, fs: { allow: [repo] } },
});
