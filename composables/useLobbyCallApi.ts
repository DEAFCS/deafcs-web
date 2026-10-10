// URL builders + fetch helpers for the optional matchmaking-lobby
// webcam call. Mirrors useCameraApi.ts's shape (same WHIP/WHEP proxy
// pattern, same api.deafcs.net origin), but talks to
// LobbyCallController (src/matches/camera/lobby-call.controller.ts)
// instead -- a separate, unforced feature from the tournament
// required-webcam one that composable covers.

export function lobbyCallJoinUrl(lobbyId: string, token: string): string {
  const webDomain = useRuntimeConfig().public.webDomain;
  return `https://${webDomain}/lobby-call/${lobbyId}/${token}`;
}

export function lobbyCallPlayerWhipUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/player/${token}/whip`;
}

export function lobbyCallPlayerStatusUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/player/${token}/status`;
}

export function lobbyCallPlayerHangupUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/player/${token}/hangup`;
}

export function lobbyCallPeerWhepUrl(lobbyId: string, steamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/${lobbyId}/${steamId}/whep`;
}

// Token-gated equivalents of participants/peer-whep above -- for the
// anonymous QR/phone join page, which is a real two-way call (publish
// AND watch everyone else), not a one-way publish-only feed like the
// required-webcam feature's token join page, so it needs these too.
export function lobbyCallPlayerParticipantsUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/player/${token}/participants`;
}

export function lobbyCallPlayerPeerWhepUrl(token: string, steamId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/player/${token}/whep/${steamId}`;
}

export function lobbyCallJoinApiUrl(lobbyId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/${lobbyId}/join`;
}

export function lobbyCallParticipantsUrl(lobbyId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/lobby-call/${lobbyId}/participants`;
}

export type LobbyCallParticipant = {
  steamId: string;
  name: string | null;
  avatarUrl: string | null;
};

export async function fetchLobbyCallStatus(
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

export async function joinLobbyCall(
  lobbyId: string,
): Promise<{ token: string; participants: LobbyCallParticipant[]; error?: string }> {
  const res = await fetch(lobbyCallJoinApiUrl(lobbyId), {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function fetchLobbyCallParticipants(
  lobbyId: string,
): Promise<LobbyCallParticipant[]> {
  try {
    const res = await fetch(lobbyCallParticipantsUrl(lobbyId), {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { participants: LobbyCallParticipant[] };
    return data.participants ?? [];
  } catch {
    return [];
  }
}

export async function fetchLobbyCallParticipantsForToken(
  token: string,
): Promise<LobbyCallParticipant[]> {
  try {
    const res = await fetch(lobbyCallPlayerParticipantsUrl(token));
    if (!res.ok) return [];
    const data = (await res.json()) as { participants: LobbyCallParticipant[] };
    return data.participants ?? [];
  } catch {
    return [];
  }
}
