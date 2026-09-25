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
).replace(/\r\n/g, "\n");
const chatInput = fs.readFileSync(
  path.resolve(__dirname, "../../components/chat/ChatInput.vue"),
  "utf8",
);
const chatLobby = fs.readFileSync(
  path.resolve(__dirname, "../../components/chat/ChatLobby.vue"),
  "utf8",
);
const socket = fs.readFileSync(
  path.resolve(__dirname, "../../web-sockets/Socket.ts"),
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
    expect(phonePage).toContain("`${api}/phone/upload`");
    expect(phonePage).toContain("`${api}/phone/send`");
    expect(phonePage).toContain("`${api}/phone/retake`");
    expect(phonePage).toContain("`${api}/phone/cancel`");
  });

  it("starts the local camera without creating a server draft first", () => {
    const startCamera = between(
      composer,
      "async function startCamera()",
      "function preferredMime()",
    );
    expect(startCamera).toContain("navigator.mediaDevices.getUserMedia");
    expect(startCamera).not.toContain("createSession");
    expect(startCamera).not.toContain("fetch(");
    expect(startCamera).not.toContain("choosePhone");
    expect(startCamera).toContain('facingMode: { ideal: "user" }');
    expect(composer).not.toContain("Flip camera");
    expect(phonePage).toContain("Flip camera");

    const sendVideo = between(
      composer,
      "async function sendVideo()",
      "async function retake()",
    );
    expect(sendVideo).toContain("await createSession()");
    expect(sendVideo).toContain("`${api}/sessions/${sessionId.value}/send`");
    expect(composer).not.toContain("modelValue");
    expect(composer).not.toContain("Video ready");
  });

  it("keeps video out of the ordinary text composer and websocket send payload", () => {
    expect(chatInput).toContain("if (!normalizedMessage) return;");
    expect(chatInput).not.toContain("videoDraft");
    expect(chatInput).not.toContain("modelValue");
    expect(chatLobby).toContain("payload.message");
    expect(chatLobby).not.toContain("videoDraftId");
    const chatSend = between(
      socket,
      "public chat(",
      "public editChat(",
    );
    expect(chatSend).toContain("message,");
    expect(chatSend).not.toContain("videoDraftId");
  });

  it("requests video without audio from PC and phone cameras", () => {
    const phoneCamera = between(
      phonePage,
      "async function openCamera()",
      "async function flipCamera()",
    );

    expect(startCameraForTest()).toMatch(/audio:\s*false/);
    expect(phoneCamera).toMatch(/audio:\s*false/);
    expect(phonePage).toContain("async function flipCamera()");
    expect(`${composer}\n${phonePage}`).not.toMatch(/audio:\s*true/);
  });

  it("keeps text rendering intact and uses the custom player only for video media", () => {
    expect(chatMessage).toContain('v-if="message.message"');
    expect(chatMessage).toContain("{{ message.message }}");
    expect(chatMessage).toContain(
      '<ChatVideoPlayer\n        v-if="message.media?.type === \'video\' && !message.blocked"',
    );
    expect(chatMessage).not.toMatch(/<video[\s\S]*?controls/);
  });

  it("creates a phone session only from Use phone and shows its loading state", () => {
    const choosePhone = between(
      composer,
      "async function choosePhone()",
      "async function startCamera()",
    );
    expect(choosePhone).toContain("await createSession()");
    expect(composer).toContain("Preparing your temporary phone session…");
    expect(composer).toContain("`${window.location.origin}/chat-video#${phoneToken}`");
  });

  it("keeps phone access capability-gated by the URL fragment and API validation", () => {
    expect(phonePage).toContain("token.value = window.location.hash.slice(1)");
    expect(phonePage).toContain("headers: { Authorization: `Bearer ${token.value}` }");
    expect(phonePage).toContain('state.value = "expired"');
    expect(phonePage).not.toContain("useAuthStore");
    expect(phonePage).not.toContain("getMe(");
  });
});

function startCameraForTest() {
  return between(
    composer,
    "async function startCamera()",
    "function preferredMime()",
  );
}
