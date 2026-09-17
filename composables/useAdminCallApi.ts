// URL builders + fetch helpers for the general admin <-> player
// webcam call, reachable from the camera icon on every player profile
// page. Mirrors useVerificationCallApi.ts's shape exactly (same
// WHIP/WHEP proxy pattern), but talks to AdminCallController
// (src/admin-calls/admin-call.controller.ts) and is keyed by the
// target player's own steamId instead of a verification application id.

export function adminCallJoinUrl(targetSteamId: string, token: string): string {
  const webDomain = useRuntimeConfig().public.webDomain;
  return `https://${webDomain}/admin-call/${targetSteamId}/${token}`;
}

export function adminCallPlayerWhipUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/player/${token}/whip`;
}

export function adminCallPlayerStatusUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/player/${token}/status`;
}

export function adminCallPlayerHangupUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/player/${token}/hangup`;
}

export function adminCallPeerWhepUrl(
  targetSteamId: string,
  steamId: string,
): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/${targetSteamId}/${steamId}/whep`;
}

// Token-gated equivalents of participants/peer-whep above -- for the
// anonymous QR/phone join page.
export function adminCallPlayerParticipantsUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/player/${token}/participants`;
}

export function adminCallPlayerPeerWhepUrl(
  token: string,
  steamId: string,
): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/player/${token}/whep/${steamId}`;
}

export function adminCallRingApiUrl(targetSteamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/${targetSteamId}/ring`;
}

export function adminCallRespondApiUrl(targetSteamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/${targetSteamId}/respond`;
}

export function adminCallJoinApiUrl(targetSteamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/${targetSteamId}/join`;
}

export function adminCallParticipantsUrl(targetSteamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/admin-calls/${targetSteamId}/participants`;
}

export type AdminCallParticipant = {
  steamId: string;
  name: string | null;
  avatarUrl: string | null;
};

export async function fetchAdminCallStatus(
  statusUrl: string,
): Promise<{ ready: boolean; steamId?: string }> {
  try {
    const res = await fetch(statusUrl);
    if (!res.ok) return { ready: false };
    return (await res.json()) as { ready: boolean; steamId?: string };
  } catch {
    return { ready: false };
  }
}

// Admin-only: rings the player (site-wide "Admin is calling..." popup,
// see GlobalAdminCallNotifier.vue).
export async function ringAdminCallPlayer(
  targetSteamId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(adminCallRingApiUrl(targetSteamId), {
    method: "POST",
    credentials: "include",
  });
  return (await res.json()) as { ok?: boolean; error?: string };
}

// Target-only: answers a ring (see GlobalAdminCallNotifier.vue's
// Accept/Decline) -- routed server-side back to whichever admin is
// actually waiting on it.
export async function respondToAdminCallRing(
  targetSteamId: string,
  accepted: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(adminCallRespondApiUrl(targetSteamId), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepted }),
  });
  return (await res.json()) as { ok?: boolean; error?: string };
}

export async function joinAdminCall(
  targetSteamId: string,
): Promise<{
  token: string;
  participants: AdminCallParticipant[];
  error?: string;
}> {
  const res = await fetch(adminCallJoinApiUrl(targetSteamId), {
    method: "POST",
    credentials: "include",
  });
  return (await res.json()) as {
    token: string;
    participants: AdminCallParticipant[];
    error?: string;
  };
}

export async function fetchAdminCallParticipants(
  targetSteamId: string,
): Promise<AdminCallParticipant[]> {
  try {
    const res = await fetch(adminCallParticipantsUrl(targetSteamId), {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      participants?: AdminCallParticipant[];
    };
    return data.participants ?? [];
  } catch {
    return [];
  }
}

export async function fetchAdminCallParticipantsForToken(
  token: string,
): Promise<AdminCallParticipant[]> {
  try {
    const res = await fetch(adminCallPlayerParticipantsUrl(token));
    if (!res.ok) return [];
    const data = (await res.json()) as {
      participants?: AdminCallParticipant[];
    };
    return data.participants ?? [];
  } catch {
    return [];
  }
}
