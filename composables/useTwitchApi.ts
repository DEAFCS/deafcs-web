// Client for the API's Twitch routes (api-deafcs src/twitch). The browser
// never talks to Twitch for live status and never sees Twitch credentials.
// Every read fails safe: on any error it reports "no channel / not live".

export type PlayerTwitch = {
  channel: string | null;
  live: boolean;
  gameName: string | null;
  title: string | null;
  checkedAt: string | null;
};

export type MatchAutoStream = {
  matchId: string;
  steamId: string;
  playerName: string;
  avatarUrl: string | null;
  channel: string;
  link: string;
  title: string | null;
  gameName: string | null;
};

const NO_TWITCH: PlayerTwitch = {
  channel: null,
  live: false,
  gameName: null,
  title: null,
  checkedAt: null,
};

function twitchApi(path: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/twitch/${path}`;
}

export async function fetchPlayerTwitch(steamId: string | number): Promise<PlayerTwitch> {
  try {
    const res = await fetch(twitchApi(`players/${encodeURIComponent(String(steamId))}`), {
      credentials: "include",
    });
    if (!res.ok) return NO_TWITCH;
    const data = (await res.json()) as Partial<PlayerTwitch>;
    return { ...NO_TWITCH, ...data, live: !!data?.live && !!data?.channel };
  } catch {
    return NO_TWITCH;
  }
}

export async function fetchMyTwitchChannel(): Promise<string | null> {
  try {
    const res = await fetch(twitchApi("me"), { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { channel?: string | null };
    return data?.channel ?? null;
  } catch {
    return null;
  }
}

// Saves (or clears with null/"") the signed-in player's own channel.
export async function saveMyTwitchChannel(
  channel: string | null,
): Promise<{ ok: true; channel: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(twitchApi("me"), {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { ok: false, error: data?.error ?? data?.message?.error ?? "save_failed" };
    }
    return { ok: true, channel: data?.channel ?? null };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

// A DEAFCS player who is live on their linked Twitch channel, in the
// Counter-Strike category (the API checks the category, game id 32399).
export type LiveStreamer = {
  steamId: string;
  playerName: string;
  avatarUrl: string | null;
  channel: string;
  link: string;
  title: string | null;
  viewerCount: number | null;
  startedAt: string | null;
  // Twitch CDN preview (320x180), when Twitch gives one.
  thumbnailUrl?: string | null;
};

// Every linked player live in Counter-Strike right now, most viewers first,
// for the homepage (API GET /twitch/live, shared server-side cache). Returns
// null when the route is missing (an API without it: stop asking) and [] on
// any other failure; the section stays hidden either way.
export async function fetchLiveStreamers(): Promise<LiveStreamer[] | null> {
  try {
    const res = await fetch(twitchApi("live"), { credentials: "include" });
    if (res.status === 404) return null;
    if (!res.ok) return [];
    const data = (await res.json()) as { streams?: LiveStreamer[] };
    return Array.isArray(data?.streams) ? data.streams : [];
  } catch {
    return [];
  }
}

// Live CS2 POV streams of seated players, per match. The API returns nothing
// for a match the viewer plays or coaches in.
export async function fetchMatchAutoStreams(
  matchIds: string[],
): Promise<Record<string, MatchAutoStream[]>> {
  const ids = [...new Set(matchIds.filter(Boolean))].slice(0, 25);
  if (!ids.length) return {};
  try {
    const res = await fetch(
      twitchApi(`match-streams?matchIds=${encodeURIComponent(ids.join(","))}`),
      { credentials: "include" },
    );
    if (!res.ok) return {};
    const data = (await res.json()) as { streams?: Record<string, MatchAutoStream[]> };
    return data?.streams ?? {};
  } catch {
    return {};
  }
}
