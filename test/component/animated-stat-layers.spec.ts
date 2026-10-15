import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import AnimatedStat from "../../components/AnimatedStat.vue";

// Match page scroll lag: every AnimatedStat character ran a one-shot flip with
// `animation-fill-mode: both`, so Chrome kept each finished animation active
// and gave each character (and what overlapped it) its own compositor layer.
// Measured on a finished 5v5 match: 527 layers before, 54 after.
const source = readFileSync(
  path.resolve(__dirname, "../../components/AnimatedStat.vue"),
  "utf8",
);
const css = source.slice(source.indexOf("<style"));
const charRule = css.match(/\.flip-stat__char\s*\{([^}]*)\}/)?.[1] ?? "";

describe("AnimatedStat does not pin a compositor layer per character", () => {
  it("the flip does not keep filling after it ends", () => {
    expect(charRule).toMatch(/animation:\s*flip-char[^;]*\bbackwards\s*;/);
    expect(charRule).not.toMatch(/\bboth\b|\bforwards\b/);
    expect(charRule).not.toMatch(/animation-fill-mode/);
  });

  it("no backface-visibility or will-change on the characters", () => {
    expect(charRule).not.toMatch(/backface-visibility/);
    expect(charRule).not.toMatch(/will-change/);
  });

  it("the last keyframe is the resting style, so nothing jumps at the end", () => {
    const last = css.match(/100%\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(last).toMatch(/transform:\s*rotateX\(0deg\)/);
    expect(last).toMatch(/opacity:\s*1/);
  });

  it("keeps the flip itself and the reduced-motion opt-out", () => {
    expect(css).toMatch(/@keyframes flip-char/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation:\s*none/);
  });

  it("still renders every character of the value", () => {
    const wrapper = mount(AnimatedStat, { props: { value: "1.58" } });
    expect(wrapper.findAll(".flip-stat__char").map((c) => c.text())).toEqual(["1", ".", "5", "8"]);
    wrapper.unmount();
  });
});
