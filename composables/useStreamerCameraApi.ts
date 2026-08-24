// URL builders for the streamer-camera feature (live camera overlay on
// a player's avatar in the match stream). Deliberately separate from
// useCameraApi.ts (the admin-only "camera required" anti-cheat check,
// api-deafcs's CameraController) -- different api-deafcs controller
// (StreamerCameraController), different audience, no shared code. See
// DEAFCS/deafcs-web#91.
//
// No token here, unlike useCameraApi.ts -- the player is already on
// their own authenticated deafcs.net session when they open their match
// page, so every call below rides that session cookie instead.

export function streamerCameraPublishWhipUrl(matchId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/streamer-camera/${matchId}/publish/whip`;
}

export function streamerCameraPublishStatusUrl(matchId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/streamer-camera/${matchId}/publish/status`;
}

export async function fetchStreamerCameraStatus(
  matchId: string,
): Promise<{ enabled: boolean; ready: boolean }> {
  try {
    const res = await fetch(streamerCameraPublishStatusUrl(matchId), {
      credentials: "include",
    });
    if (!res.ok) return { enabled: false, ready: false };
    return (await res.json()) as { enabled: boolean; ready: boolean };
  } catch {
    return { enabled: false, ready: false };
  }
}
