// URL builders for the "camera required" tournament feature. All calls
// hit api-deafcs's CameraController (src/matches/camera/), which proxies
// WHIP/WHEP SDP to the dedicated mediamtx-camera instance — see that
// controller's comments for why signaling stays on this one origin
// (api.deafcs.net) instead of a new subdomain.

export function cameraPlayerJoinUrl(matchId: string, token: string): string {
  const webDomain = useRuntimeConfig().public.webDomain;
  return `https://${webDomain}/matches/${matchId}/camera/${token}`;
}

export function cameraPlayerWhipUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/player/${token}/whip`;
}

export function cameraPlayerStatusUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/player/${token}/status`;
}

export function cameraAdminWhepUrl(matchId: string, steamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/admin/${matchId}/${steamId}/whep`;
}

export function cameraAdminPlayersUrl(matchId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/admin/${matchId}/players`;
}

// The "Watch Camera" popup window — a whole-team grid, not a
// one-at-a-time picker, so an organizer can watch every player at
// once the way they'd want to during an actual match.
export function cameraAdminGridUrl(matchId: string): string {
  const webDomain = useRuntimeConfig().public.webDomain;
  return `https://${webDomain}/matches/${matchId}/camera-admin`;
}

export async function fetchCameraStatus(
  token: string,
): Promise<{ ready: boolean }> {
  try {
    const res = await fetch(cameraPlayerStatusUrl(token));
    if (!res.ok) return { ready: false };
    return (await res.json()) as { ready: boolean };
  } catch {
    return { ready: false };
  }
}

export type CameraPlayerStatus = {
  steamId: string;
  name: string | null;
  lineupId: string;
  ready: boolean;
};

export async function fetchCameraPlayers(matchId: string): Promise<{
  lineup_1: { id: string; name: string; players: CameraPlayerStatus[] };
  lineup_2: { id: string; name: string; players: CameraPlayerStatus[] };
}> {
  const res = await fetch(cameraAdminPlayersUrl(matchId), {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}
