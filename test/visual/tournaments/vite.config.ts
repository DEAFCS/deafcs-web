import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import tailwind from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig";
import autoprefixer from "autoprefixer";
const root = path.resolve(__dirname,"../../..");
export default defineConfig({ root, plugins:[vue()], resolve:{alias:[
  {find:"#app",replacement:path.join(__dirname,"providers.ts")},
  {find:"#components",replacement:path.join(__dirname,"providers.ts")},
  {find:"~/stores/MatchLobbyStore",replacement:path.join(__dirname,"providers.ts")},
  {find:"~/stores/AuthStore",replacement:path.join(__dirname,"providers.ts")},
  {find:"~/stores/ApplicationSettings",replacement:path.join(__dirname,"providers.ts")},
  {find:"@vue/apollo-composable",replacement:path.join(__dirname,"providers.ts")},
  {find:"~/components/PlayerDisplay.vue",replacement:path.join(__dirname,"Player.vue")},
  {find:"~",replacement:root},{find:"@",replacement:root},
]}, css:{postcss:{plugins:[tailwind({ ...loadConfig(path.join(root,"tailwind.config.js")), content:[path.join(root,"components/**/*.vue"),path.join(__dirname,"**/*.vue")] }),autoprefixer()]}}, server:{host:"127.0.0.1",port:18083,strictPort:true}, build:{target:"esnext"} });
