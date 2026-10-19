// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { previousEntryIs } from "~/composables/useInAppBack";
import BackToLink from "~/components/common/BackToLink.vue";

// "Back to Awards" and friends: a real Back when the page they name is the one
// the user came from, so the installed app does not stack
// Awards -> award -> Awards -> award ... and the list keeps its scroll.

describe("previousEntryIs", () => {
  it("matches the page the user came from, ignoring its query", () => {
    expect(previousEntryIs({ back: "/awards" }, "/awards")).toBe(true);
    expect(previousEntryIs({ back: "/awards?tier=gold" }, "/awards")).toBe(true);
    expect(previousEntryIs({ back: "/awards/" }, "/awards")).toBe(true);
  });

  it("does not match another page, the first entry or another site", () => {
    expect(previousEntryIs({ back: "/players" }, "/awards")).toBe(false);
    expect(previousEntryIs({ back: "/awards/manage" }, "/awards")).toBe(false);
    expect(previousEntryIs({ back: null }, "/awards")).toBe(false);
    expect(previousEntryIs({ back: "//evil.example/awards" }, "/awards")).toBe(
      false,
    );
  });
});

describe("BackToLink", () => {
  const back = vi.fn();
  const navigate = vi.fn((event?: MouseEvent) => event?.preventDefault());

  const NuxtLink = defineComponent({
    props: { to: { type: String, required: true }, custom: Boolean },
    setup(props, { slots }) {
      return () => slots.default?.({ href: props.to, navigate });
    },
  });

  function render() {
    return mount(BackToLink, {
      props: { to: "/awards" },
      attrs: { class: "back-link" },
      slots: { default: "Back to Awards" },
      global: { stubs: { NuxtLink } },
    });
  }

  beforeEach(() => {
    back.mockReset();
    navigate.mockClear();
    vi.stubGlobal("useRouter", () => ({ back }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one plain link to the page", () => {
    window.history.replaceState({ back: null }, "");
    const link = render().get("a");
    expect(link.attributes("href")).toBe("/awards");
    expect(link.classes()).toContain("back-link");
    expect(link.text()).toBe("Back to Awards");
  });

  it("steps back when the user came from that page", async () => {
    window.history.replaceState({ back: "/awards?tier=gold", position: 2 }, "");
    await render().get("a").trigger("click");

    expect(back).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the page normally when the app was opened onto this one", async () => {
    window.history.replaceState({ back: null, position: 0 }, "");
    await render().get("a").trigger("click");

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("opens the page normally when the user came from somewhere else", async () => {
    window.history.replaceState({ back: "/players", position: 3 }, "");
    await render().get("a").trigger("click");

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("leaves a modified click (new tab) to the link", async () => {
    window.history.replaceState({ back: "/awards", position: 2 }, "");
    await render().get("a").trigger("click", { ctrlKey: true });

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("DEAFCS Back links use it", () => {
  const read = (file: string) =>
    readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(
      /\r\n/g,
      "\n",
    );

  it.each([
    ["pages/awards/[id].vue", 'to="/awards"'],
    ["pages/awards/manage.vue", 'to="/awards"'],
    ["pages/matches/[id]/chat-log.vue", ':to="`/matches/${match.id}`"'],
  ])("%s", (file, to) => {
    const source = read(file).replace(/\s+/g, " ");
    expect(source).toContain(`<BackToLink ${to}`);
    expect(source).not.toContain(`<NuxtLink ${to}`);
  });
});
