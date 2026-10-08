import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clipPreloadUrl } from "../../utilities/clipPreloadUrl";

// The hidden next-clip preloader buffers a whole clip before it is shown, so
// it is requested with noview=1 and never counts as a view. The visible player
// keeps the plain URL.
describe("clip preload URL", () => {
  it("adds noview=1 to a URL that already has a query", () => {
    expect(
      clipPreloadUrl("https://demos.deafcs.net/clips/abc?name=x.mp4&v=1"),
    ).toBe("https://demos.deafcs.net/clips/abc?name=x.mp4&v=1&noview=1");
  });

  it("adds noview=1 to a URL with no query", () => {
    expect(clipPreloadUrl("https://demos.deafcs.net/clips/abc")).toBe(
      "https://demos.deafcs.net/clips/abc?noview=1",
    );
  });

  it("only the hidden preloader uses it; the shown player keeps the plain URL", () => {
    const source = readFileSync(
      resolve(__dirname, "../../components/clips/ClipDetailModal.vue"),
      "utf8",
    );
    expect(source).toContain("return clipPreloadUrl(p.download_url);");
    expect(source).toContain(':src="clip.download_url"');
  });
});
