// URL builders for the streamer-camera feature (live camera overlay on
// a player's avatar in the match stream). Deliberately separate from
// useCameraApi.ts (the admin-only "camera required" anti-cheat check,
// api-deafcs's CameraController) -- different api-deafcs controller
// (StreamerCameraController), different table
// (match_streamer_camera_tokens vs match_camera_tokens), different
// audience, no shared code. See DEAFCS/deafcs-web#91.
//
// Mirrors useCameraApi.ts's token-based shape exactly (same reasoning:
// a phone scanning a QR code has no deafcs.net login of its own, so a
// Hasura session isn't enough).

export function streamerCameraPlayerJoinUrl(matchId: string, token: string): string {
  const webDomain = useRuntimeConfig().public.webDomain;
  return `https://${webDomain}/matches/${matchId}/streamer-camera/${token}`;
}

export function streamerCameraPlayerWhipUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/streamer-camera/player/${token}/whip`;
}

export function streamerCameraPlayerStatusUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/streamer-camera/player/${token}/status`;
}

export async function fetchStreamerCameraStatus(
  token: string,
): Promise<{ enabled: boolean; ready: boolean }> {
  try {
    const res = await fetch(streamerCameraPlayerStatusUrl(token));
    if (!res.ok) return { enabled: false, ready: false };
    return (await res.json()) as { enabled: boolean; ready: boolean };
  } catch {
    return { enabled: false, ready: false };
  }
}
