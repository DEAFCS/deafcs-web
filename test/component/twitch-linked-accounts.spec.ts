import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { normalizeTwitchChannel } from "../../utilities/twitchChannel";

// The real API client is replaced; the card keeps the real client-side
// normalization so invalid input is caught before any request.
const api = vi.hoisted(() => ({
  fetchMyTwitchChannel: vi.fn(),
  fetchPlayerTwitch: vi.fn(),
  saveMyTwitchChannel: vi.fn(),
}));
vi.mock("~/composables/useTwitchApi", () => api);
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

import TwitchChannelCard from "../../components/settings/TwitchChannelCard.vue";

const NO_STATUS = { channel: null, live: false, gameName: null, title: null, checkedAt: null };
// What the API returns without Twitch credentials: the channel, status unknown.
const unknown = (channel: string) => ({ ...NO_STATUS, channel });
const offline = (channel: string) => ({ ...NO_STATUS, channel, checkedAt: "2026-10-05T10:00:00Z" });
const live = (channel: string) => ({ ...offline(channel), live: true, title: "live" });

async function mountCard(saved: string | null, status: any = NO_STATUS) {
  api.fetchMyTwitchChannel.mockResolvedValue(saved);
  api.fetchPlayerTwitch.mockResolvedValue(status);
  const w = mount(TwitchChannelCard, {
    props: { steamId: "76561198000000001" },
    global: {
      mocks: { $t: (k: string) => k },
      // The real Button needs Nuxt auto-imported stores.
      stubs: { TwitchIcon: { template: "<svg />" }, Button: { template: "<button><slot /></button>" } },
    },
  });
  await flushPromises();
  return w;
}

const $ = (w: any, id: string) => w.find(`[data-testid="${id}"]`);
const state = (w: any) => $(w, "twitch-channel-card").attributes("data-state");
const statusText = (w: any) => $(w, "twitch-channel-status").text();
const input = (w: any) => $(w, "twitch-channel-input").element as HTMLInputElement;

async function type(w: any, value: string) {
  await $(w, "twitch-channel-input").setValue(value);
}
async function submit(w: any) {
  await w.find("form").trigger("submit");
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  api.saveMyTwitchChannel.mockImplementation(async (channel: string | null) => ({
    ok: true,
    // The API normalizes; mirror that here.
    channel: channel ? (normalizeTwitchChannel(channel) as any).channel : null,
  }));
});

describe("Linked Accounts: Twitch Channel card", () => {
  it("no channel: Not configured, empty input, no link, no Remove", async () => {
    const w = await mountCard(null);
    expect($(w, "twitch-channel-card").exists()).toBe(true);
    expect(state(w)).toBe("not_configured");
    expect(statusText(w)).toContain("status_not_configured");
    expect(input(w).value).toBe("");
    expect($(w, "twitch-channel-open").exists()).toBe(false);
    expect($(w, "twitch-channel-remove").exists()).toBe(false);
    // Nothing to ask Twitch status about.
    expect(api.fetchPlayerTwitch).not.toHaveBeenCalled();
  });

  it("loads an existing channel as Configured and never says Connected", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    expect(input(w).value).toBe("tricon");
    expect(state(w)).toBe("configured");
    expect(statusText(w)).toContain("status_configured");
    expect(w.text().toLowerCase()).not.toContain("connected");
    expect(api.fetchPlayerTwitch).toHaveBeenCalledWith("76561198000000001");
  });

  it("missing Twitch credentials (status unknown, or the status call failing) still shows Configured, no error, no dot", async () => {
    for (const status of [unknown("tricon"), NO_STATUS]) {
      const w = await mountCard("tricon", status);
      expect(state(w)).toBe("configured");
      expect($(w, "twitch-channel-live-dot").exists()).toBe(false);
      expect($(w, "twitch-channel-offline").exists()).toBe(false);
      expect($(w, "twitch-channel-invalid").exists()).toBe(false);
    }
  });

  it("offline (status known): Configured with a subtle Offline, no dot", async () => {
    const w = await mountCard("tricon", offline("tricon"));
    expect(state(w)).toBe("offline");
    expect(statusText(w)).toContain("status_configured");
    expect($(w, "twitch-channel-offline").text()).toContain("status_offline");
    expect($(w, "twitch-channel-live-dot").exists()).toBe(false);
  });

  it("live: green dot and Live", async () => {
    const w = await mountCard("tricon", live("tricon"));
    expect(state(w)).toBe("live");
    expect($(w, "twitch-channel-live-dot").classes()).toContain("bg-emerald-500");
    expect(statusText(w)).toContain("status_live");
  });

  it("links to the channel safely in a new tab", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    const link = $(w, "twitch-channel-open");
    expect(link.attributes("href")).toBe("https://www.twitch.tv/tricon");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
  });

  it("saves a username with its own Save action and shows it as Configured", async () => {
    const w = await mountCard(null);
    expect($(w, "twitch-channel-save").attributes("disabled")).toBeDefined();
    api.fetchPlayerTwitch.mockResolvedValue(unknown("tricon"));
    await type(w, "TricoN");
    await submit(w);
    expect(api.saveMyTwitchChannel).toHaveBeenCalledWith("tricon");
    expect(input(w).value).toBe("tricon");
    expect(state(w)).toBe("configured");
    expect($(w, "twitch-channel-open").attributes("href")).toBe("https://www.twitch.tv/tricon");
  });

  it.each(["@tricon", "twitch.tv/tricon", "https://www.twitch.tv/tricon/"])(
    "normalizes %j to the channel name",
    async (value) => {
      const w = await mountCard(null);
      await type(w, value);
      await submit(w);
      expect(api.saveMyTwitchChannel).toHaveBeenCalledWith("tricon");
      expect(input(w).value).toBe("tricon");
    },
  );

  it.each(["https://clips.twitch.tv/SomeClip", "https://www.twitch.tv/videos/123", "twitch.tv/tricon/extra"])(
    "rejects %j before saving",
    async (value) => {
      const w = await mountCard(null);
      await type(w, value);
      await submit(w);
      expect(api.saveMyTwitchChannel).not.toHaveBeenCalled();
      expect($(w, "twitch-channel-invalid").text()).toContain("twitch.invalid");
      // Editing clears the hint.
      await type(w, "tricon");
      expect($(w, "twitch-channel-invalid").exists()).toBe(false);
    },
  );

  it("shows the API's rejection without changing the saved channel", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    api.saveMyTwitchChannel.mockResolvedValueOnce({ ok: false, error: "invalid_channel" });
    await type(w, "other_name");
    await submit(w);
    expect($(w, "twitch-channel-invalid").exists()).toBe(true);
    expect($(w, "twitch-channel-open").attributes("href")).toBe("https://www.twitch.tv/tricon");
  });

  it("Save stays disabled when nothing changed", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    expect($(w, "twitch-channel-save").attributes("disabled")).toBeDefined();
    await type(w, "https://twitch.tv/TricoN");
    expect($(w, "twitch-channel-save").attributes("disabled")).toBeDefined();
  });

  it("updates to another channel", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    await type(w, "theft_cs");
    await submit(w);
    expect(api.saveMyTwitchChannel).toHaveBeenCalledWith("theft_cs");
    expect($(w, "twitch-channel-open").attributes("href")).toBe("https://www.twitch.tv/theft_cs");
  });

  it("Remove clears the channel", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    await $(w, "twitch-channel-remove").trigger("click");
    await flushPromises();
    expect(api.saveMyTwitchChannel).toHaveBeenCalledWith(null);
    expect(state(w)).toBe("not_configured");
    expect(input(w).value).toBe("");
    expect($(w, "twitch-channel-remove").exists()).toBe(false);
  });

  it("saving an empty box also clears the channel", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    await type(w, "");
    await submit(w);
    expect(api.saveMyTwitchChannel).toHaveBeenCalledWith(null);
    expect(state(w)).toBe("not_configured");
  });

  it("input and actions stack on mobile, sit in a row from sm up", async () => {
    const w = await mountCard("tricon", unknown("tricon"));
    const row = w.find("form > div");
    expect(row.classes()).toEqual(expect.arrayContaining(["flex-col", "sm:flex-row"]));
  });
});
