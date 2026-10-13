import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { mount } from "@vue/test-utils";
import BlockActionButton from "./fixtures/BlockActionButton.vue";

// Regression coverage for the "large white Block player text" bug that
// SURVIVED the earlier FiveStackToolTip `as-child` fix (commit c29015de,
// see the now-removed block-player-tooltip-trigger.spec.ts). That fix
// assumed a nested-<button> SSR/hydration mismatch was leaving the
// tooltip's own default-slot text detached from its portalled position.
// It reportedly did NOT resolve the issue in production, so the tooltip
// wrapper (FiveStackToolTip) was removed entirely: the trigger is now a
// plain native <button> with :title/:aria-label and no default-slot text
// anywhere for a portal to mis-place.
describe("Block action button: no tooltip wrapper, no visible text node", () => {
  it("renders exactly one button containing only an icon, no text", () => {
    const wrapper = mount(BlockActionButton, {
      props: { isBlockedByMe: false },
    });
    const col = wrapper.find('[data-testid="right-col"]');
    expect(col.findAll("button")).toHaveLength(1);

    const button = wrapper.find('[data-testid="block-toggle"]');
    expect(button.text()).toBe("");
    expect(button.text()).not.toContain("Block");
    expect(button.text()).not.toContain("Unblock");
  });

  it("shows the Ban icon when not blocked, and exposes the label via title/aria-label only", () => {
    const wrapper = mount(BlockActionButton, {
      props: { isBlockedByMe: false },
    });
    const button = wrapper.find('[data-testid="block-toggle"]');
    expect(button.find("svg.lucide-ban").exists()).toBe(true);
    expect(button.attributes("title")).toBe("Block player");
    expect(button.attributes("aria-label")).toBe("Block player");
  });

  it("shows the UserCheck icon when blocked, and flips the label", () => {
    const wrapper = mount(BlockActionButton, {
      props: { isBlockedByMe: true },
    });
    const button = wrapper.find('[data-testid="block-toggle"]');
    expect(button.find("svg.lucide-user-check").exists()).toBe(true);
    expect(button.attributes("title")).toBe("Unblock player");
    expect(button.attributes("aria-label")).toBe("Unblock player");
  });
});

describe("players/[id].vue source: Block action no longer uses FiveStackToolTip", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../pages/players/[id].vue"),
    "utf8",
  );

  it("does not wrap the block/unblock trigger in FiveStackToolTip anywhere in the file", () => {
    expect(source).not.toContain("FiveStackToolTip");
  });

  it("a single secondary action stays an accessible native icon-only button", () => {
    const controls = fs.readFileSync(
      path.resolve("components/player/PlayerHeroActions.vue"),
      "utf8",
    );
    expect(controls).toMatch(
      /<button\s+v-if="actions.length === 1"[\s\S]*?:title="actions\[0\].label"[\s\S]*?:aria-label="actions\[0\].label"/,
    );
    expect(controls).toContain('<component :is="actions[0].icon" />');
    expect(source).toContain(
      "run: this.isBlockedByMe ? this.unblockPlayerClick : this.requestBlockPlayer",
    );
  });
});
