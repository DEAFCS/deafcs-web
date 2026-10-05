import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { computed, readonly, ref } from "vue";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

test("legacy chat preferences cannot enable audio; matchmaking sounds still play", () => {
  const saved = new Map([
    ["chat-sound-enabled", "true"],
    ["chat-message-sound-enabled", "true"],
    ["chat-sound-volume", "0.7"],
  ]);
  let contexts = 0;
  let starts = 0;
  const parameter = {
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  };
  const node = () => new Proxy({
    connect() {}, start() { starts++; }, stop() {},
  }, { get: (target, key) => target[key] ?? parameter });
  class AudioContext {
    constructor() { contexts++; }
    currentTime = 0;
    sampleRate = 1000;
    destination = {};
    createOscillator = node;
    createGain = node;
    createDynamicsCompressor = node;
    createBiquadFilter = node;
    createDelay = node;
    createBufferSource = node;
    createBuffer(_channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
  }
  const source = compile(read("composables/useSound.ts")
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export const useSound", "const useSound")
    .replaceAll("import.meta.client", "true")) + "\nglobalThis.sound = useSound();";
  const context = vm.createContext({
    computed, readonly, ref,
    useMatchLobbyStore: () => ({ currentUserInGame: false }),
    localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    window: { AudioContext },
    setTimeout() { assert.fail("chat must not schedule delayed audio"); },
    console: { warn() { assert.fail("matchmaking audio failed"); } },
  });
  vm.runInContext(source, context);
  const sound = context.sound;
  assert.equal(sound.isChatSoundEnabled.value, false);
  sound.updateChatSoundSetting(true);
  sound.playNotificationSound();
  assert.equal(saved.get("chat-message-sound-enabled"), "false");
  assert.equal(contexts, 0);
  assert.equal(sound.isEnabled.value, true);
  assert.equal(sound.volume.value, 0.7);
  for (const play of [sound.playMatchFoundSound, sound.playTickSound, sound.playCountdownSound]) {
    const before = starts;
    play();
    assert.ok(starts > before, "matchmaking alert must produce audio");
  }
  assert.equal(contexts, 3);
  sound.updateSettings(false);
  sound.playMatchFoundSound();
  sound.playTickSound();
  sound.playCountdownSound();
  assert.equal(contexts, 3, "existing matchmaking sound toggle still works");
});

test("all chat push categories are silent; urgent matchmaking/call options remain intact", () => {
  let push;
  let shown;
  vm.runInNewContext(read("public/sw-push.js"), {
    self: {
      addEventListener: (name, callback) => { if (name === "push") push = callback; },
      registration: { showNotification: (title, options) => { shown = { title, options }; } },
    },
  });
  const send = (data) => {
    push({ data: { json: () => data }, waitUntil() {} });
    return shown.options;
  };
  for (const type of ["ChatMessage", "MatchChatMessage", "GlobalChatMessage", "OrganizerChatMessage", "AnnouncementChatMessage"]) {
    for (const urgent of [false, true]) {
      const options = send({ type, urgent, title: "New message", body: "hello", entity_id: "match:1" });
      assert.equal(options.silent, true);
      assert.equal(options.vibrate, undefined);
      assert.equal(options.body, "hello");
      assert.equal(options.data.type, type);
      assert.equal(options.data.entity_id, "match:1");
    }
  }
  for (const type of ["MatchFound", "CallRing"]) {
    const options = send({ type, urgent: true, tag: "ready-check" });
    assert.equal(options.silent, undefined);
    assert.deepEqual(Array.from(options.vibrate), [300, 150, 300, 150, 300]);
    assert.equal(options.requireInteraction, true);
    assert.equal(options.renotify, true);
    assert.equal(options.tag, "ready-check");
  }
  assert.equal(send({ type: "TeamInvite" }).silent, undefined);
});

test("shared room handler delivers visual notifications even when legacy sound prop is true", () => {
  const lobby = read("components/chat/ChatLobby.vue");
  const callback = lobby.match(/this\.lobbyListener = socket\.listenChat\([\s\S]*?(\(message: any\) => \{[\s\S]*?)\r?\n          },\r?\n        \);/);
  assert.ok(callback, "locate the production message listener");
  // The production arrow captures the component's `this`. Use a normal
  // function here so each test room supplies that same component context.
  const callbackSource = callback[1].replace("(message: any) =>", "function(message: any)");
  const handler = vm.runInNewContext(compile(`globalThis.handler = ${callbackSource}\n}`), {
    socket: { sessionId: "browser" },
    useAuthStore: () => ({ me: { steam_id: "me" } }),
  });
  assert.equal(typeof handler, "function");
  for (const type of ["match", "team", "match_team", "captain_pick_team", "draft", "tournament", "matchmaking", "global", "direct", "organizers", "announcement"]) {
    const emitted = [];
    const state = {
      type, messages: [], global: true, isMinimized: true, unreadCount: 0,
      isActiveTab: false, isAtBottom: false, lastReadMessageCount: 0,
      playNotificationSound: true, tabId: `${type}:1`,
      safeScrollToBottom() {}, $emit: (...args) => emitted.push(args),
    };
    const inbound = { from: { steam_id: "other" }, clientId: "other-browser" };
    handler.call(state, inbound);
    assert.equal(state.messages[0], inbound);
    assert.equal(state.unreadCount, 1);
    assert.equal(emitted[0][0], "message-received");
    assert.equal(emitted[0][1].direction, "inbound");
    handler.call(state, { from: { steam_id: "me" }, clientId: "browser" });
    assert.equal(state.unreadCount, 1);
    assert.equal(state.lastReadMessageCount, 2);
    assert.equal(emitted[1][1].direction, "outbound");
  }
});
