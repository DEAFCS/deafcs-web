// Twitch channel input normalization -- mirrors api-deafcs
// src/twitch/twitch-channel.ts so Profile Settings can explain a problem
// before saving. The API normalizes again and is the authority.
//
// Accepted:  "TricoN", "@tricon", "twitch.tv/tricon",
//            "https://www.twitch.tv/TricoN/"
// Rejected:  clips, videos, other Twitch pages, other sites, invalid logins.

export const TWITCH_LOGIN_PATTERN = /^[a-z0-9_]{4,25}$/;

const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

const RESERVED_PATHS = new Set([
  "videos",
  "video",
  "clip",
  "clips",
  "directory",
  "downloads",
  "drops",
  "inventory",
  "jobs",
  "login",
  "messages",
  "p",
  "payments",
  "popout",
  "prime",
  "search",
  "settings",
  "signup",
  "store",
  "subscriptions",
  "turbo",
  "wallet",
  "embed",
  "moderator",
  "team",
]);

export type TwitchChannelError = "invalid_url" | "unsupported_url" | "invalid_channel";
export type TwitchChannelResult =
  | { ok: true; channel: string | null }
  | { ok: false; error: TwitchChannelError };

export function normalizeTwitchChannel(
  input: string | null | undefined,
): TwitchChannelResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: true, channel: null };

  let candidate = raw;
  if (/[/.:]/.test(raw)) {
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return { ok: false, error: "invalid_url" };
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, error: "invalid_url" };
    }
    if (!TWITCH_HOSTS.has(url.hostname.toLowerCase())) {
      return { ok: false, error: "unsupported_url" };
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return { ok: false, error: "unsupported_url" };
    candidate = segments[0];
    if (RESERVED_PATHS.has(candidate.toLowerCase())) {
      return { ok: false, error: "unsupported_url" };
    }
  } else if (candidate.startsWith("@")) {
    candidate = candidate.slice(1);
  }

  const login = candidate.toLowerCase();
  if (!TWITCH_LOGIN_PATTERN.test(login)) return { ok: false, error: "invalid_channel" };
  return { ok: true, channel: login };
}

export function twitchChannelUrl(channel: string): string {
  return `https://www.twitch.tv/${channel}`;
}

// The Twitch channel a stream link points at (lowercased), or null when the
// link is not a plain twitch.tv/<channel> link. Used to spot an automatic
// player stream that staff already attached by hand.
export function twitchChannelFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    if (host === "player.twitch.tv") {
      const channel = url.searchParams.get("channel");
      return channel ? channel.toLowerCase() : null;
    }
    if (!TWITCH_HOSTS.has(host)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1 || RESERVED_PATHS.has(segments[0].toLowerCase())) {
      return null;
    }
    return segments[0].toLowerCase();
  } catch {
    return null;
  }
}
