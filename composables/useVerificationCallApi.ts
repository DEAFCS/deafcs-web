// URL builders + fetch helpers for the admin <-> applicant verification
// call. Mirrors useLobbyCallApi.ts's shape exactly (same WHIP/WHEP proxy
// pattern, same api.deafcs.net origin), but talks to
// VerificationCallController (src/verification-applications/verification-call.controller.ts)
// instead -- always exactly two fixed parties (whichever admin rang, and
// the one applicant), not an arbitrary lobby roster.

// A separate top-level path from the /verification-applications/call/
// popup page above -- nesting this under the same directory as
// [applicationId].vue made Vue Router resolve it to the wrong
// component (same reason /lobby-call/[lobbyId]/[token] is kept
// entirely separate from /matchmaking/lobby-call/[lobbyId]).
export function verificationCallJoinUrl(
  applicationId: string,
  token: string,
): string {
  const webDomain = useRuntimeConfig().public.webDomain;
  return `https://${webDomain}/verification-call/${applicationId}/${token}`;
}

export function verificationCallPlayerWhipUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/player/${token}/whip`;
}

export function verificationCallPlayerStatusUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/player/${token}/status`;
}

export function verificationCallPlayerHangupUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/player/${token}/hangup`;
}

export function verificationCallPeerWhepUrl(
  applicationId: string,
  steamId: string,
): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/${applicationId}/${steamId}/whep`;
}

// Token-gated equivalents of participants/peer-whep above -- for the
// anonymous QR/phone join page, which is a real two-way call (publish
// AND watch the other side), not a one-way publish-only feed.
export function verificationCallPlayerParticipantsUrl(token: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/player/${token}/participants`;
}

export function verificationCallPlayerPeerWhepUrl(
  token: string,
  steamId: string,
): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/player/${token}/whep/${steamId}`;
}

export function verificationCallRingApiUrl(applicationId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/${applicationId}/ring`;
}

export function verificationCallRespondApiUrl(applicationId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/${applicationId}/respond`;
}

export function verificationCallJoinApiUrl(applicationId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/${applicationId}/join`;
}

export function verificationCallParticipantsUrl(applicationId: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/verification-applications/call/${applicationId}/participants`;
}

export type VerificationCallParticipant = {
  steamId: string;
  name: string | null;
  avatarUrl: string | null;
};

export async function fetchVerificationCallStatus(
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

// Admin-only: rings the applicant (site-wide "Admin is calling..."
// popup, see GlobalVerificationCallNotifier.vue).
export async function ringVerificationApplicant(
  applicationId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(verificationCallRingApiUrl(applicationId), {
    method: "POST",
    credentials: "include",
  });
  return (await res.json()) as { ok?: boolean; error?: string };
}

// Applicant-only: answers a ring (see GlobalVerificationCallNotifier.vue's
// Accept/Decline) -- routed server-side back to whichever admin is
// actually waiting on it.
export async function respondToVerificationRing(
  applicationId: string,
  accepted: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(verificationCallRespondApiUrl(applicationId), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepted }),
  });
  return (await res.json()) as { ok?: boolean; error?: string };
}

export async function joinVerificationCall(
  applicationId: string,
): Promise<{
  token: string;
  participants: VerificationCallParticipant[];
  error?: string;
}> {
  const res = await fetch(verificationCallJoinApiUrl(applicationId), {
    method: "POST",
    credentials: "include",
  });
  return (await res.json()) as {
    token: string;
    participants: VerificationCallParticipant[];
    error?: string;
  };
}

export async function fetchVerificationCallParticipants(
  applicationId: string,
): Promise<VerificationCallParticipant[]> {
  try {
    const res = await fetch(verificationCallParticipantsUrl(applicationId), {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      participants?: VerificationCallParticipant[];
    };
    return data.participants ?? [];
  } catch {
    return [];
  }
}

// Token-gated equivalent of the above -- for the anonymous QR/phone
// join page, which has no session to scope a request by applicationId.
export async function fetchVerificationCallParticipantsForToken(
  token: string,
): Promise<VerificationCallParticipant[]> {
  try {
    const res = await fetch(verificationCallPlayerParticipantsUrl(token));
    if (!res.ok) return [];
    const data = (await res.json()) as {
      participants?: VerificationCallParticipant[];
    };
    return data.participants ?? [];
  } catch {
    return [];
  }
}
