import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "~/components/ui/tooltip";
import BlockButtonTooltipTrigger from "./fixtures/BlockButtonTooltipTrigger.vue";

// Root cause of the "large white Block player text" seen in production:
// FiveStackToolTip's trigger slot was used WITHOUT `as-child`. Without it,
// reka-ui's TooltipTrigger renders as its OWN real <button>, wrapping our
// already-real, fully-styled <button> inside it -- i.e. literal nested
// <button><button>...</button></button> markup, which no other
// FiveStackToolTip call site in the codebase does (they all pass as-child,
// e.g. ChatMessage.vue's role-badge tooltip).
//
// This is invalid HTML (button cannot contain interactive content) and the
// two DOM-construction paths Vue can take disagree about what happens to it:
//  - Parsing an SSR HTML *string* (a real browser's tree-construction
//    algorithm auto-closes the outer button the instant it sees a nested
//    <button> start tag, splitting one nested pair into two SIBLING
//    buttons -- confirmed against a real Chromium engine, not just jsdom).
//  - Building the same tree via Vue's runtime DOM patches (client-side
//    navigation, no parser involved) keeps the buttons genuinely nested.
// Either way the live DOM no longer matches what Vue's hydration expects,
// which is exactly the class of bug that can leave stray content -- like
// this tooltip's own default-slot text ("Block player") -- detached from
// its intended hidden/portalled position and rendered plainly in the page.
//
// The fix is `as-child`: reka-ui then merges its trigger behavior directly
// onto our single real <button> via mergeProps instead of adding a wrapper,
// so the compiled output is exactly one <button> and there is nothing left
// for a parser or a hydration mismatch to split.
describe("FiveStackToolTip Block trigger renders as a single real <button>, not nested", () => {
  it("SSR output contains exactly one <button> tag for the trigger area (no nested wrapper)", async () => {
    const app = createSSRApp(BlockButtonTooltipTrigger);
    app.component("TooltipProvider", TooltipProvider);
    app.component("Tooltip", Tooltip);
    app.component("TooltipTrigger", TooltipTrigger);
    app.component("TooltipContent", TooltipContent);
    const html = await renderToString(app);

    const buttonOpenTagCount = (html.match(/<button[ >]/g) ?? []).length;
    expect(buttonOpenTagCount).toBe(1);

    // The one button that does exist must be OUR real, fully-styled,
    // accessible button -- not an empty reka-ui wrapper.
    expect(html).toContain('aria-label="Block player"');
    expect(html).toContain("h-full");
    expect(html).toContain("lucide-ban");
  });
});

describe("players/[id].vue source: Block action tooltip trigger", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../pages/players/[id].vue"),
    "utf8",
  );

  it("uses as-child so the trigger slot's own <button> isn't wrapped in a second one", () => {
    expect(source).toContain('<FiveStackToolTip side="bottom" as-child>');
  });
});
