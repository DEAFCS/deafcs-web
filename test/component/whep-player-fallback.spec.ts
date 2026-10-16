import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import WhepPlayer from "../../components/match/WhepPlayer.vue";

// Adapted from 5Stack WEB #698 (tests/components/match/WhepPlayer.spec.ts),
// MIT Copyright (c) 2025 5Stack.gg; mounted with @vue/test-utils instead of
// @nuxt/test-utils. DEAFCS adds the last case: a call or camera tile (no
// fallbackUrl) keeps retrying WebRTC and never falls back.
const WHEP_URL = "https://stream.example/match-1/whep";
const FALLBACK_URL = "https://stream.example/match-1/";

const peers: FakePeerConnection[] = [];

class FakePeerConnection {
  connectionState = "new";
  iceGatheringState = "complete";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: unknown = null;

  constructor() {
    peers.push(this);
  }

  addTransceiver() {}
  addEventListener() {}
  removeEventListener() {}
  getSenders() {
    return [];
  }
  getReceivers() {
    return [];
  }
  async getStats() {
    return new Map();
  }
  async createOffer() {
    return { type: "offer" as const, sdp: "offer" };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
  close() {}

  become(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

let whepStatus = 201;
let mounted: VueWrapper<any> | null = null;

async function answered(n: number) {
  await vi.waitFor(
    () => {
      expect(peers.length).toBe(n);
      expect(peers[n - 1].remoteDescription).not.toBeNull();
    },
    { timeout: 5000 },
  );
}

function mountPlayer(props: Record<string, unknown> = { fallbackUrl: FALLBACK_URL }) {
  mounted = mount(WhepPlayer, {
    props: { whepUrl: WHEP_URL, ...props },
    global: { mocks: { $t: (key: string) => key } },
  });
  return mounted;
}

beforeEach(() => {
  peers.length = 0;
  whepStatus = 201;
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) =>
      String(input) === WHEP_URL
        ? Promise.resolve(new Response("answer", { status: whepStatus }))
        : Promise.reject(new Error("unexpected fetch " + String(input))),
    ),
  );
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});

describe("WhepPlayer HLS fallback (5Stack #698)", () => {
  it("falls back to HLS when WebRTC never connects", async () => {
    const wrapper = mountPlayer();

    for (let attempt = 1; attempt <= 3; attempt++) {
      await answered(attempt);
      peers[attempt - 1].become("failed");
      await flushPromises();
    }

    await vi.waitFor(() =>
      expect(wrapper.find("iframe").attributes("src")).toBe(FALLBACK_URL),
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(peers.length).toBe(3);
  });

  it("falls back to HLS when the WHEP request keeps failing", async () => {
    whepStatus = 500;
    const wrapper = mountPlayer();

    await vi.waitFor(
      () => expect(wrapper.find("iframe").attributes("src")).toBe(FALLBACK_URL),
      { timeout: 5000 },
    );
    expect(peers.length).toBe(3);
  });

  it("keeps retrying WebRTC instead of falling back once it has connected", async () => {
    const wrapper = mountPlayer();

    await answered(1);
    peers[0].become("connected");
    peers[0].become("failed");

    for (let attempt = 2; attempt <= 4; attempt++) {
      await answered(attempt);
      peers[attempt - 1].become("failed");
      await flushPromises();
    }

    await answered(5);
    expect(wrapper.find("iframe").exists()).toBe(false);
  });

  it("never falls back without a fallbackUrl (calls and camera tiles)", async () => {
    const wrapper = mountPlayer({});

    for (let attempt = 1; attempt <= 3; attempt++) {
      await answered(attempt);
      peers[attempt - 1].become("failed");
      await flushPromises();
    }

    await answered(4);
    expect(wrapper.find("iframe").exists()).toBe(false);
  });
});
