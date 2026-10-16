import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

// deafcs-web#123: match stats were left-aligned under their headings. Every
// stat header and value is now centered in its column, for both teams; the
// sticky player column stays left-aligned. This builds the real Tailwind CSS
// for the classes the components use and checks the computed alignment.
const root = path.resolve(__dirname, "../..");
const read = (p: string) =>
  fs.readFileSync(path.join(root, p), "utf8").split("\r\n").join("\n");

const overview = read("components/match/LineupOverview.vue");
const row = read("components/match/LineupOverviewRow.vue");
const tableHead = read("components/ui/table/TableHead.vue");
const sortableHead = read("components/common/SortableTableHead.vue");
const tableCell = read("components/ui/table/TableCell.vue");
const template = overview.slice(
  overview.indexOf("<template>"),
  overview.lastIndexOf("</template>"),
);

// Class strings exactly as the components write them.
const tableClass = template.match(/<Table\s+class="([^"]+)"/)![1];
const headBase = tableHead.match(/cn\('([^']+)'/)![1];
const cellBase = tableCell.match(/'(p-2 align-middle[^']+)'/)![1];
const stickyHead = template.match(
  /<TableHead\s+v-if="!hideMember"\s+class="([^"]+)"/,
)![1];
const stickyCell = row.match(/'(relative w-\[110px\][^']+sticky[^']+)'/)![1];
// The sortable heading group and its icon block, as SortableTableHead writes them.
const sortGroup = sortableHead.match(/<span (data-sort-group) class="([^"]+)">/)!;
const sortIcons = sortableHead.match(/<span data-sort-icons class="([^"]+)">/)![1];
const sortIcon = sortableHead.match(/<ChevronUp\s+class="([^"]+)"/)![1];
const damageBlock = row.match(
  /<div class="(hidden md:flex flex-col[^"]+)">/,
)![1];

let doc: Document;

beforeAll(async () => {
  // Tailwind's own loader, as Nuxt uses: the config is CommonJS.
  const require = createRequire(import.meta.url);
  const loadConfig = require("tailwindcss/loadConfig");
  const config = loadConfig(path.join(root, "tailwind.config.js"));
  const used = [
    tableClass,
    headBase,
    cellBase,
    stickyHead,
    stickyCell,
    damageBlock,
    "whitespace-nowrap cursor-pointer inline-flex items-center gap-1 tabular-nums",
    sortGroup[2],
    sortIcons,
    sortIcon,
  ].join(" ");
  const { css } = await postcss([
    tailwindcss({
      ...(config.default ?? config),
      content: [{ raw: `<div class="${used}"></div>`, extension: "html" }],
    }),
  ]).process("@tailwind base; @tailwind utilities;", { from: undefined });

  // One table, two teams, the way LineupOverview renders them.
  const team = (name: string) => `
    <thead>
      <tr>
        <th class="${stickyHead}">${name}</th>
        <th class="${headBase} whitespace-nowrap cursor-pointer" data-stat>
          <span data-sort-group class="${sortGroup[2]}">Kills<span data-sort-icons class="${sortIcons}"><svg class="${sortIcon}"></svg></span></span>
        </th>
        <th class="${headBase} whitespace-nowrap cursor-pointer" data-stat>
          <span data-sort-group class="${sortGroup[2]}">KAST<span data-sort-icons class="${sortIcons}"><svg class="${sortIcon}"></svg></span></span>
        </th>
        <th class="${headBase} whitespace-nowrap" data-stat>Total Damage</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="${stickyCell}">player</td>
        <td class="${cellBase} tabular-nums" data-stat>20</td>
        <td class="${cellBase} tabular-nums" data-stat>
          <span class="inline-flex items-center gap-0.5">78%</span>
        </td>
        <td class="${cellBase}" data-stat>
          <div class="${damageBlock}" data-damage><span>2199</span></div>
        </td>
      </tr>
    </tbody>`;

  doc = document;
  doc.head.innerHTML = `<style>${css}</style>`;
  doc.body.innerHTML = `<table class="${tableClass}">${team("Team 1")}${team(
    "Team 2",
  )}</table>`;
});

const align = (el: Element) =>
  window.getComputedStyle(el as HTMLElement).textAlign;

describe("match stats alignment (deafcs-web#123)", () => {
  it("centers every stat header and value, for both teams", () => {
    const stats = [...doc.querySelectorAll("[data-stat]")];
    expect(stats).toHaveLength(12);
    for (const el of stats) {
      expect(`${el.tagName} ${el.textContent!.trim()} ${align(el)}`).toBe(
        `${el.tagName} ${el.textContent!.trim()} center`,
      );
    }
  });

  // A sortable heading is its label plus the sort-icon block. The spacer
  // before the label equals that block, so the label (not just the group)
  // sits over the centered values. Same rule for both teams.
  it("pads each sortable heading by exactly its sort-icon block, for both teams", () => {
    const px = (v: string) =>
      v ? parseFloat(v) * (v.endsWith("rem") ? 16 : 1) : 0;
    const groups = [...doc.querySelectorAll("th:not(.sticky) [data-sort-group]")];
    expect(groups).toHaveLength(4);
    for (const g of groups) {
      const style = window.getComputedStyle(g as HTMLElement);
      const icon = window.getComputedStyle(g.querySelector("svg")!);
      expect(px(style.paddingLeft)).toBe(px(icon.width) + px(style.columnGap || style.gap));
      expect(px(style.paddingLeft)).toBe(16);
      expect(px(style.paddingRight)).toBe(0);
    }
    expect(sortGroup[1]).toBe("data-sort-group");
  });

  it("keeps the sticky player column left-aligned", () => {
    const sticky = [...doc.querySelectorAll("th.sticky, td.sticky")];
    expect(sticky).toHaveLength(4);
    for (const el of sticky) {
      expect(align(el)).not.toBe("center");
    }
  });

  it("centers the stacked Total Damage and ADR block", () => {
    for (const el of doc.querySelectorAll("[data-damage]")) {
      expect(window.getComputedStyle(el as HTMLElement).alignItems).toBe(
        "center",
      );
    }
  });

  it("renders both teams through one table, header and row", () => {
    expect(template.match(/<Table\b/g)).toHaveLength(1);
    expect(template.match(/<TableHeader\b/g)).toHaveLength(1);
    expect(template.match(/<LineupOverviewRow\b/g)).toHaveLength(1);
    expect(template).toContain(
      '<template v-for="(lp, lpIdx) of lineupsToRender" :key="lp.id">',
    );
  });
});
