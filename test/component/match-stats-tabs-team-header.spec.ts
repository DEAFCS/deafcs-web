import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

// deafcs-web#123 follow-up, mirroring match-overview-team-alignment.spec.ts
// for the other match stats tabs. The second team's header used to get 28px
// of top padding and a 3px border inside it. Both team headers are now the
// same; the line between the teams is the bottom border of the first team's
// last row. This builds the real Tailwind CSS for each tab's classes and
// checks the computed boxes.
const root = path.resolve(__dirname, "../..");
const read = (p: string) =>
  fs.readFileSync(path.join(root, p), "utf8").split("\r\n").join("\n");

const tableHead = read("components/ui/table/TableHead.vue");
const tableCell = read("components/ui/table/TableCell.vue");
const headBase = tableHead.match(/cn\('([^']+)'/)![1];
const cellBase = tableCell.match(/'(p-2 align-middle[^']+)'/)![1];
const sectionBase = (file: string, tag: string) => {
  const source = read(file);
  const start = source.indexOf(`<${tag} :class="cn('`) + `<${tag} :class="cn('`.length;
  return source.slice(start, source.indexOf("'", start));
};
const theadBase = sectionBase("components/ui/table/TableHeader.vue", "thead");
const tbodyBase = sectionBase("components/ui/table/TableBody.vue", "tbody");
const trBase = sectionBase("components/ui/table/TableRow.vue", "tr");

const require = createRequire(import.meta.url);
const loadConfig = require("tailwindcss/loadConfig");
const config = loadConfig(path.join(root, "tailwind.config.js"));

const tabs = [
  "LineupAimStats",
  "LineupOpeningDuels",
  "LineupTradeStats",
  "LineupUtility",
];

const style = (el: Element) => window.getComputedStyle(el as HTMLElement);
const px = (v: string) => (v ? parseFloat(v) * (v.endsWith("rem") ? 16 : 1) : 0);

describe.each(tabs)("%s team headers (deafcs-web#123)", (tab) => {
  const source = read(`components/match/${tab}.vue`);
  const template = source.slice(
    source.indexOf("<template>"),
    source.lastIndexOf("</template>"),
  );
  // Class strings exactly as the component writes them.
  const tableClass = template.match(/<Table\s+class="([^"]+)"/)![1];
  const teamHeaderTag = template.match(/<TableHeader\b[^>]*>/)![0];
  const teamHeader = teamHeaderTag.match(/\sclass="([^"]+)"/)?.[1] ?? "";
  const stickyHead = template.match(/<TableHead\b[^>]*?\sclass="([^"]*sticky[^"]*)"/)![1];

  const render = async () => {
    const used = [tableClass, headBase, cellBase, stickyHead, theadBase, tbodyBase, trBase, teamHeader].join(" ");
    const { css } = await postcss([
      tailwindcss({
        ...(config.default ?? config),
        content: [{ raw: `<div class="${used}"></div>`, extension: "html" }],
      }),
    ]).process("@tailwind base; @tailwind utilities;", { from: undefined });

    // One table, two teams, the way the tab renders them.
    const team = (name: string) => `
      <thead class="${theadBase} ${teamHeader}" data-team-header>
        <tr class="${trBase}">
          <th class="${stickyHead}">${name}</th>
          <th class="${headBase}">Stat</th>
        </tr>
      </thead>
      <tbody class="${tbodyBase}">
        <tr class="${trBase}"><td class="${cellBase}">player</td><td class="${cellBase}">1</td></tr>
        <tr class="${trBase}" data-last-row><td class="${cellBase}">player</td><td class="${cellBase}">2</td></tr>
      </tbody>`;
    document.head.innerHTML = `<style>${css}</style>`;
    document.body.innerHTML = `<table class="${tableClass}">${team("Team 1")}${team("Team 2")}</table>`;
  };

  it("gives both team headers the same padding, height and no border inside", async () => {
    // One static class, no per-team binding.
    expect(teamHeaderTag).not.toContain(":class");
    expect(teamHeader).toContain("[&_th]:h-12");
    expect(teamHeader).not.toMatch(/\bpt-|\bpy-|\bp-\d|border-t/);
    await render();
    const heads = [...document.querySelectorAll("[data-team-header]")];
    expect(heads).toHaveLength(2);
    const box = (h: Element) =>
      [h, ...h.querySelectorAll("th")].map((el) => {
        const s = style(el);
        return [s.paddingTop, s.paddingBottom, s.borderTopWidth, s.height].join(" ");
      });
    expect(box(heads[1])).toEqual(box(heads[0]));
    expect(px(style(heads[1]).borderTopWidth)).toBe(0);
  });

  it("separates the teams with the first team's last row, not the second header", async () => {
    await render();
    const [first, second] = [...document.querySelectorAll("[data-last-row]")];
    expect(px(style(first).borderBottomWidth)).toBe(3);
    expect(px(style(second).borderBottomWidth)).toBe(0);
  });

  it("renders both teams through one table and header", () => {
    expect(template.match(/<Table\b/g)).toHaveLength(1);
    expect(template.match(/<TableHeader\b/g)).toHaveLength(1);
    expect(template).toContain(
      '<template v-for="(lp, lpIdx) of lineupsToRender" :key="lp.id">',
    );
  });
});
