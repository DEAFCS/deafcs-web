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
// On touch, StatLabel puts an info button before the heading text.
const statLabel = read("components/common/StatLabel.vue");
const touchWrap = statLabel.match(/<span v-if="headerTouch" class="([^"]+)">/)![1];
const infoButton = statLabel.match(/data-stat-info\s+class="([^"]+)"/)![1];
const infoIcon = statLabel.match(/<Info class="([^"]+)"/)![1];
// The KAST value and the trend chevron that may follow it.
const kastSpan = row.match(
  /<TableCell v-if="overviewVis.kast !== false" class="tabular-nums">\s*<span class="([^"]+)">/,
)![1];
// The table section wrappers, as the shared table components write them.
const sectionBase = (file: string, tag: string) => {
  const source = read(file);
  const start = source.indexOf(`<${tag} :class="cn('`) + `<${tag} :class="cn('`.length;
  return source.slice(start, source.indexOf("'", start));
};
const theadBase = sectionBase("components/ui/table/TableHeader.vue", "thead");
const tbodyBase = sectionBase("components/ui/table/TableBody.vue", "tbody");
const trBase = sectionBase("components/ui/table/TableRow.vue", "tr");
// Each team's header, exactly as LineupOverview writes it (one static class).
const teamHeaderTag = template.match(/<TableHeader\b[^>]*>/)![0];
const teamHeader = teamHeaderTag.match(/\sclass="([^"]+)"/)?.[1] ?? "";
const chevron = read("components/StatChevron.vue").match(
  /'(inline-block align-middle[^']+)'/,
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
    touchWrap,
    infoButton,
    infoIcon,
    kastSpan,
    chevron,
    theadBase,
    tbodyBase,
    trBase,
    teamHeader,
  ].join(" ");
  const { css } = await postcss([
    tailwindcss({
      ...(config.default ?? config),
      content: [{ raw: `<div class="${used}"></div>`, extension: "html" }],
    }),
  ]).process("@tailwind base; @tailwind utilities;", { from: undefined });

  // One table, two teams, the way LineupOverview renders them.
  const team = (name: string) => `
    <thead class="${theadBase} ${teamHeader}" data-team-header>
      <tr class="${trBase}">
        <th class="${stickyHead}">${name}</th>
        <th class="${headBase} whitespace-nowrap cursor-pointer" data-stat>
          <span data-sort-group class="${sortGroup[2]}">Kills<span data-sort-icons class="${sortIcons}"><svg class="${sortIcon}"></svg></span></span>
        </th>
        <th class="${headBase} whitespace-nowrap cursor-pointer" data-stat>
          <span data-sort-group class="${sortGroup[2]}">KAST<span data-sort-icons class="${sortIcons}"><svg class="${sortIcon}"></svg></span></span>
        </th>
        <th class="${headBase} whitespace-nowrap" data-stat>Total Damage</th>
        <th class="${headBase} whitespace-nowrap cursor-pointer" data-stat>
          <span data-sort-group data-touch class="${sortGroup[2]}"><span class="${touchWrap}"><button type="button" data-stat-info class="${infoButton}"><svg class="${infoIcon}"></svg></button>K</span><span data-sort-icons class="${sortIcons}"><svg class="${sortIcon}"></svg></span></span>
        </th>
      </tr>
    </thead>
    <tbody class="${tbodyBase}">
      <tr class="${trBase}">
        <td class="${stickyCell}">player</td>
        <td class="${cellBase} tabular-nums" data-stat>20</td>
        <td class="${cellBase} tabular-nums" data-stat>
          <span data-kast class="${kastSpan}">78%<svg role="img" data-stat-chevron class="${chevron}"></svg></span>
        </td>
        <td class="${cellBase}" data-stat>
          <div class="${damageBlock}" data-damage><span>2199</span></div>
        </td>
        <td class="${cellBase} tabular-nums" data-stat>20</td>
      </tr>
      <tr class="${trBase}" data-last-row>
        <td class="${stickyCell}">player</td>
        <td class="${cellBase} tabular-nums" data-stat>11</td>
        <td class="${cellBase} tabular-nums" data-stat>
          <span data-kast class="${kastSpan}">70%</span>
        </td>
        <td class="${cellBase}" data-stat>
          <div class="${damageBlock}" data-damage><span>1500</span></div>
        </td>
        <td class="${cellBase} tabular-nums" data-stat>11</td>
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
const style = (el: Element) => window.getComputedStyle(el as HTMLElement);
const px = (v: string) => (v ? parseFloat(v) * (v.endsWith("rem") ? 16 : 1) : 0);
// Width an icon takes beside the text: the svg, plus any padding and
// margin of the box around it, plus the flex gap to the text.
const iconBlock = (icon: Element, gapFrom: Element) => {
  const svg = icon.tagName === "svg" ? icon : icon.querySelector("svg")!;
  const box = style(icon);
  const edges =
    icon === svg
      ? 0
      : px(box.paddingLeft) +
        px(box.paddingRight) +
        px(box.marginLeft) +
        px(box.marginRight);
  return (
    px(style(svg).width) +
    edges +
    px(style(gapFrom).columnGap || style(gapFrom).gap)
  );
};

describe("match stats alignment (deafcs-web#123)", () => {
  it("centers every stat header and value, for both teams", () => {
    const stats = [...doc.querySelectorAll("[data-stat]")];
    expect(stats).toHaveLength(24);
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
    const groups = [
      ...doc.querySelectorAll("th:not(.sticky) [data-sort-group]:not([data-touch])"),
    ];
    expect(groups).toHaveLength(4);
    for (const g of groups) {
      const arrows = iconBlock(g.querySelector("[data-sort-icons] svg")!, g);
      expect(px(style(g).paddingLeft)).toBe(arrows);
      expect(px(style(g).paddingLeft)).toBe(16);
      expect(px(style(g).paddingRight)).toBe(0);
    }
    expect(sortGroup[1]).toBe("data-sort-group");
  });

  // Touch: the info button before the text (26px) and the arrows after it
  // (16px) are balanced, so the text, not the icons, sits over the values.
  it("balances the touch info icon against the sort arrows, for both teams", () => {
    const groups = [...doc.querySelectorAll("th:not(.sticky) [data-sort-group][data-touch]")];
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      const info = iconBlock(g.querySelector("[data-stat-info]")!, g.firstElementChild!);
      const arrows = iconBlock(g.querySelector("[data-sort-icons] svg")!, g);
      expect(info).toBe(26);
      expect(arrows).toBe(16);
      expect(px(style(g).paddingLeft) + info).toBe(px(style(g).paddingRight) + arrows);
    }
  });

  // A trend chevron after a value is balanced on the left; values without one
  // get no padding. Both center the number itself.
  it("balances the KAST trend chevron only when it renders, for both teams", () => {
    const kast = [...doc.querySelectorAll("[data-kast]")];
    expect(kast).toHaveLength(4);
    for (const k of kast) {
      const chev = k.querySelector("[data-stat-chevron]");
      const expected = chev ? iconBlock(chev, k) : 0;
      expect(px(style(k).paddingLeft)).toBe(expected);
      expect(px(style(k).paddingRight)).toBe(0);
    }
    expect(kast.filter((k) => k.querySelector("[data-stat-chevron]"))).toHaveLength(2);
    expect(px(style(kast[0]).paddingLeft)).toBe(16);
  });

  it("keeps the sticky player column left-aligned", () => {
    const sticky = [...doc.querySelectorAll("th.sticky, td.sticky")];
    expect(sticky).toHaveLength(6);
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

  // The second team's header used to get 28px of top padding and a 3px
  // border inside it, which pushed its text to the bottom of the row. Both
  // headers are now the same; the line between the teams is the bottom border
  // of the first team's last row.
  it("gives both team headers the same padding, height and no border inside", () => {
    // One static class, no per-team binding.
    expect(teamHeaderTag).not.toContain(":class");
    expect(teamHeader).toContain("[&_th]:h-12");
    expect(teamHeader).not.toMatch(/\bpt-|\bpy-|\bp-\d|border-t/);
    const heads = [...doc.querySelectorAll("[data-team-header]")];
    expect(heads).toHaveLength(2);
    const box = (h: Element) => {
      const th = h.querySelectorAll("th");
      return [h, ...th].map((el) => {
        const s = style(el);
        return [s.paddingTop, s.paddingBottom, s.borderTopWidth, s.height].join(" ");
      });
    };
    expect(box(heads[1])).toEqual(box(heads[0]));
    expect(px(style(heads[1]).borderTopWidth)).toBe(0);
    expect(px(style(heads[1].querySelector("th")!).paddingTop)).toBe(
      px(style(heads[0].querySelector("th")!).paddingTop),
    );
  });

  it("separates the teams with the first team's last row, not the second header", () => {
    const [first, second] = [...doc.querySelectorAll("[data-last-row]")];
    expect(px(style(first).borderBottomWidth)).toBe(3);
    expect(px(style(second).borderBottomWidth)).toBe(0);
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
