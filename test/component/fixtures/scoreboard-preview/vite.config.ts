import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { createJiti } from "jiti";

const repo = path.resolve(__dirname, "../../../..");
const tailwindConfig = createJiti(import.meta.url)(path.join(repo, "tailwind.config.js"));
export default defineConfig({
  root: __dirname,
  publicDir: path.join(repo, "public"),
  plugins: [vue(), {
    // Row fixtures have no clips or Nuxt session; keep that service isolated.
    name: "fixture-clip-modal",
    resolveId: id => id === "\0fixture-clip-modal" ? id : undefined,
    load: id => id === "\0fixture-clip-modal" ? "export function useClipModal() { throw new Error('Clips are not available in this fixture'); }" : undefined,
  }],
  resolve: { alias: [
    { find: "~/composables/useClipModal", replacement: "\0fixture-clip-modal" },
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
