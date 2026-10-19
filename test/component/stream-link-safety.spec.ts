// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Nuxt auto-imports read at module load by the components' imports.
vi.hoisted(() => {
  (globalThis as any).useRuntimeConfig = () => ({
    public: { webDomain: "deafcs.test" },
  });
});

import { isHttpLink } from "~/utilities/httpLink";
import StreamEmbed from "~/components/StreamEmbed.vue";
import MatchLiveStreams from "~/components/match/MatchLiveStreams.vue";

// Stream links are saved by match organizers and shown to every viewer, so a
// javascript: or data: link must never be embedded, opened or saved
// (5stackgg/web 5bff33a2, #815).

const UNSAFE = [
  "javascript:alert(document.cookie)",
  "JavaScript:void(0)",
  " javascript:alert(1)",
  "data:text/html,<p>stream</p>",
  "vbscript:msgbox(1)",
  "//evil.example/player",
  "",
];

const embed = (StreamEmbed as any).methods;
const liveStreams = (MatchLiveStreams as any).methods;

describe("isHttpLink", () => {
  it.each(UNSAFE)("refuses %j", (link) => {
    expect(isHttpLink(link)).toBe(false);
  });

  it("refuses a missing link", () => {
    expect(isHttpLink(null)).toBe(false);
    expect(isHttpLink(undefined)).toBe(false);
  });

  it.each([
    "https://twitch.tv/caster",
    "http://stream.example.com/live",
    "HTTPS://www.youtube.com/watch?v=abc",
    "https://kick.com/caster",
  ])("accepts %s", (link) => {
    expect(isHttpLink(link)).toBe(true);
  });
});

describe("StreamEmbed links", () => {
  it.each(UNSAFE)("never embeds %j", (link) => {
    expect(embed.parseStreamLink.call({}, link)).toEqual({
      platform: null,
      embedId: null,
    });
  });

  it("still embeds Twitch, YouTube, Kick and self-hosted players", () => {
    const parse = (link: string) => embed.parseStreamLink.call({}, link);
    expect(parse("https://twitch.tv/caster")).toEqual({
      platform: "twitch",
      embedId: "caster",
    });
    expect(parse("https://www.youtube.com/watch?v=abc")).toEqual({
      platform: "youtube",
      embedId: "abc",
    });
    expect(parse("https://kick.com/caster")).toEqual({
      platform: "kick",
      embedId: "caster",
    });
    expect(parse("https://stream.example.com/player")).toEqual({
      platform: "iframe",
      embedId: "https://stream.example.com/player",
    });
  });

  it("shows no platform icon for an unsafe link instead of throwing", () => {
    const self = { parseStreamLink: embed.parseStreamLink };
    expect(embed.getPlatformIcon.call(self, "javascript:alert(1)")).toBe(
      undefined,
    );
  });

  it("sandboxes a self-hosted player so it can't navigate this tab", () => {
    const playerRef = document.createElement("div");
    const self = {
      $refs: { playerRef },
      cleanupPlayer: () => {},
      playerInstance: null,
    };

    embed.mountGenericIframe.call(self, "https://stream.example.com/player");

    const iframe = playerRef.querySelector("iframe")!;
    expect(iframe.getAttribute("src")).toBe(
      "https://stream.example.com/player",
    );
    const sandbox = iframe.getAttribute("sandbox")?.split(" ") ?? [];
    expect(sandbox).toEqual(
      expect.arrayContaining(["allow-scripts", "allow-same-origin"]),
    );
    expect(sandbox).not.toContain("allow-top-navigation");
    expect(sandbox).not.toContain("allow-forms");
    expect(sandbox).not.toContain("allow-modals");
  });
});

describe("MatchLiveStreams links", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens an http(s) stream in a new tab without an opener", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    liveStreams.openStream("https://twitch.tv/caster");

    expect(open).toHaveBeenCalledWith(
      "https://twitch.tv/caster",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it.each(UNSAFE)("never opens %j", (link) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    liveStreams.openStream(link);

    expect(open).not.toHaveBeenCalled();
  });

  it("disables the open button and checks the form for an unsafe link", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../components/match/MatchLiveStreams.vue"),
      "utf8",
    );
    expect(source).toMatch(/!isHttpLink\(stream\.link\)/);
    expect(source).toMatch(
      /\.refine\(isHttpLink,\s*\{\s*message: this\.\$t\("streams\.link_must_be_http"\)/,
    );
  });

  it("has the form message in every language", () => {
    const dir = path.resolve(__dirname, "../../i18n/locales");
    const en = JSON.parse(readFileSync(path.join(dir, "en.json"), "utf8"));
    expect(en.streams.link_must_be_http).toBe(
      "Enter a link that starts with http:// or https://",
    );
  });
});
