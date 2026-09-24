import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const composer = fs.readFileSync(
  path.resolve(__dirname, "../../components/chat/ChatVideoComposer.vue"),
  "utf8",
);
const phonePage = fs.readFileSync(
  path.resolve(__dirname, "../../pages/chat-video.vue"),
  "utf8",
);
const chatMessage = fs.readFileSync(
  path.resolve(__dirname, "../../components/chat/ChatMessage.vue"),
  "utf8",
);

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Short Video API routing and local recording startup", () => {
  it("uses the API ingress prefix for composer, phone, and playback requests", () => {
    expect(composer).toContain(
      "const api = `https://${config.public.apiDomain}/matches/chat-video`;",
    );
    expect(phonePage).toContain(
      "const api = `https://${config.public.apiDomain}/matches/chat-video`;",
    );
    expect(chatMessage).toContain("/matches/chat-video/media/");
  });

  it("starts the local camera without creating a server draft first", () => {
    const startCamera = between(
      composer,
      "async function startCamera()",
      "async function flipCamera()",
    );
    expect(startCamera).toContain("navigator.mediaDevices.getUserMedia");
    expect(startCamera).not.toContain("createSession");
    expect(startCamera).not.toContain("fetch(");

    const uploadVideo = between(
      composer,
      "async function uploadVideo()",
      "async function discardDraft()",
    );
    expect(uploadVideo).toContain("await createSession()");
  });

  it("creates a phone session only from Use phone and shows its loading state", () => {
    const choosePhone = between(
      composer,
      "async function choosePhone()",
      "async function startCamera()",
    );
    expect(choosePhone).toContain("await createSession()");
    expect(composer).toContain("Preparing your temporary phone session…");
  });
});
