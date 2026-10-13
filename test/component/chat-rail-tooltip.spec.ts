import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

// Reported in production: hovering a conversation in the hub rail (Theft's
// private-message avatar, other rooms too) opened its tooltip at the top-left
// corner of the screen. reka's ContextMenuTrigger renders a fragment: a
// virtual MenuAnchor at the pointer (0x0) followed by the real element. With
// it nested INSIDE TooltipTrigger as-child, the tooltip's anchor resolved to
// that virtual point (anchor width/height 0, popper at translate(0,0)).
// Reproduced and verified fixed in a real browser with reka-ui 2.9.7; jsdom has
// no layout, so this guards the nesting that fixes it.
describe("hub rail tooltips", () => {
  const panel = read("components/hub/ChatPanel.vue").replace(/\r\n/g, "\n");
  const rail = panel.slice(
    panel.indexOf("<TooltipProvider :key"),
    panel.indexOf("</TooltipProvider>"),
  );

  it("nests the tooltip trigger inside the context-menu trigger, never the reverse", () => {
    const contextTrigger = rail.indexOf("<ContextMenuTrigger as-child>");
    const tooltipTrigger = rail.indexOf("<TooltipTrigger as-child>");
    expect(contextTrigger).toBeGreaterThan(-1);
    expect(tooltipTrigger).toBeGreaterThan(contextTrigger);
    expect(rail.indexOf("</TooltipTrigger>")).toBeLessThan(
      rail.indexOf("</ContextMenuTrigger>"),
    );
  });

  it("anchors the tooltip to the rail button itself and opens it beside the icon", () => {
    expect(rail).toMatch(
      /<TooltipTrigger as-child>\s*<button\s+:ref="setChatButtonRef\(tab\.id\)"/,
    );
    expect(rail).toContain('<TooltipContent\n                    side="left"');
  });

  it("still resets tooltips on navigation and only shows them for keyboard focus, not mouse press", () => {
    expect(panel).toContain("const tooltipEpoch = ref(0);");
    expect(panel).toMatch(/\(\) => route\.fullPath,\s*\(\) => tooltipEpoch\.value\+\+/);
    expect(panel).toContain(':ignore-non-keyboard-focus="true"');
  });

  it("no component nests a context-menu trigger inside a tooltip trigger", () => {
    for (const file of [
      "components/hub/ChatPanel.vue",
      "layouts/components/RightHub.vue",
      "components/matchmaking-lobby/FriendListItem.vue",
      "components/matchmaking-lobby/FriendOptions.vue",
    ]) {
      expect(read(file)).not.toMatch(
        /<TooltipTrigger as-child>\s*<ContextMenuTrigger/,
      );
    }
  });
});
