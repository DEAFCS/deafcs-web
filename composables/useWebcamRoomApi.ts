// One adapter shape for every multi-party webcam room that uses the
// lobby-call media stack (mediamtx WHIP publish + WHEP pull):
// - the matchmaking lobby call (LobbyCallController)
// - the tournament webcam support room (TournamentCallController)
// The shared popout (components/webcam/WebcamCallRoom.vue) and phone/QR
// page (components/webcam/WebcamTokenJoin.vue) only talk to a room
// through this, so both rooms share one UI and one video stack.
import {
  fetchLobbyCallParticipants,
  fetchLobbyCallParticipantsForToken,
  joinLobbyCall,
  lobbyCallJoinUrl,
  lobbyCallPeerWhepUrl,
  lobbyCallPlayerHangupUrl,
  lobbyCallPlayerPeerWhepUrl,
  lobbyCallPlayerStatusUrl,
  lobbyCallPlayerWhipUrl,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

export type WebcamRoomParticipant = LobbyCallParticipant;

export type WebcamRoomJoinResult = {
  token?: string;
  participants?: WebcamRoomParticipant[];
  canKick?: boolean;
  max?: number;
  error?: string;
};

// Token-gated half: everything the anonymous phone/QR page needs.
export interface WebcamTokenRoom {
  playerWhipUrl(token: string): string;
  playerStatusUrl(token: string): string;
  playerHangupUrl(token: string): string;
  playerPeerWhepUrl(token: string, steamId: string): string;
  fetchParticipantsForToken(token: string): Promise<WebcamRoomParticipant[]>;
}

export interface WebcamRoom extends WebcamTokenRoom {
  kind: "lobby" | "tournament";
  roomId: string;
  // Socket event prefix for the call-joining / call-joined / call-left
  // presence events (`${channel}:call-joined`, ...).
  channel: string;
  // Periodic participant refresh (ms). Catches people whose connection
  // dropped without a call-left event. Unset keeps event-only updates.
  pollParticipantsMs?: number;
  joinPageUrl(token: string): string;
  peerWhepUrl(steamId: string): string;
  join(): Promise<WebcamRoomJoinResult>;
  fetchParticipants(): Promise<{
    participants: WebcamRoomParticipant[];
    canKick: boolean;
  }>;
  // Only rooms with moderation (tournament) implement this.
  kick?(steamId: string): Promise<{ ok?: boolean; error?: string }>;
}

export function createLobbyWebcamRoom(lobbyId: string): WebcamRoom {
  return {
    kind: "lobby",
    roomId: lobbyId,
    channel: `lobby:matchmaking:${lobbyId}`,
    joinPageUrl: (token) => lobbyCallJoinUrl(lobbyId, token),
    playerWhipUrl: lobbyCallPlayerWhipUrl,
    playerStatusUrl: lobbyCallPlayerStatusUrl,
    playerHangupUrl: lobbyCallPlayerHangupUrl,
    playerPeerWhepUrl: lobbyCallPlayerPeerWhepUrl,
    peerWhepUrl: (steamId) => lobbyCallPeerWhepUrl(lobbyId, steamId),
    join: () => joinLobbyCall(lobbyId),
    fetchParticipants: async () => ({
      participants: await fetchLobbyCallParticipants(lobbyId),
      canKick: false,
    }),
    fetchParticipantsForToken: fetchLobbyCallParticipantsForToken,
  };
}

export function createLobbyWebcamTokenRoom(): WebcamTokenRoom {
  return {
    playerWhipUrl: lobbyCallPlayerWhipUrl,
    playerStatusUrl: lobbyCallPlayerStatusUrl,
    playerHangupUrl: lobbyCallPlayerHangupUrl,
    playerPeerWhepUrl: lobbyCallPlayerPeerWhepUrl,
    fetchParticipantsForToken: fetchLobbyCallParticipantsForToken,
  };
}

// --- Tournament webcam support room ---

// Same cap the API enforces (MAX_PARTICIPANTS in lobby-call.service.ts).
export const TOURNAMENT_WEBCAM_MAX = 5;
// The chat header count and the popout both refresh on this interval.
export const TOURNAMENT_WEBCAM_POLL_MS = 15_000;

function tournamentCallApi(path: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/matches/camera/tournament-call/${path}`;
}

export function tournamentWebcamPopoutPath(tournamentId: string): string {
  return `/tournaments/webcam/${tournamentId}`;
}

export function createTournamentWebcamTokenRoom(): WebcamTokenRoom {
  return {
    playerWhipUrl: (token) => tournamentCallApi(`player/${token}/whip`),
    playerStatusUrl: (token) => tournamentCallApi(`player/${token}/status`),
    playerHangupUrl: (token) => tournamentCallApi(`player/${token}/hangup`),
    playerPeerWhepUrl: (token, steamId) =>
      tournamentCallApi(`player/${token}/whep/${steamId}`),
    fetchParticipantsForToken: async (token) => {
      try {
        const res = await fetch(tournamentCallApi(`player/${token}/participants`));
        if (!res.ok) return [];
        const data = (await res.json()) as {
          participants?: WebcamRoomParticipant[];
        };
        return data.participants ?? [];
      } catch {
        return [];
      }
    },
  };
}

export async function fetchTournamentWebcamParticipants(
  tournamentId: string,
): Promise<{ participants: WebcamRoomParticipant[]; canKick: boolean }> {
  try {
    const res = await fetch(tournamentCallApi(`${tournamentId}/participants`), {
      credentials: "include",
    });
    if (!res.ok) return { participants: [], canKick: false };
    const data = (await res.json()) as {
      participants?: WebcamRoomParticipant[];
      canKick?: boolean;
    };
    return { participants: data.participants ?? [], canKick: !!data.canKick };
  } catch {
    return { participants: [], canKick: false };
  }
}

export function createTournamentWebcamRoom(tournamentId: string): WebcamRoom {
  const webDomain = useRuntimeConfig().public.webDomain;
  return {
    ...createTournamentWebcamTokenRoom(),
    kind: "tournament",
    roomId: tournamentId,
    channel: `lobby:tournament:${tournamentId}`,
    pollParticipantsMs: TOURNAMENT_WEBCAM_POLL_MS,
    joinPageUrl: (token) =>
      `https://${webDomain}/tournament-call/${tournamentId}/${token}`,
    peerWhepUrl: (steamId) => tournamentCallApi(`${tournamentId}/${steamId}/whep`),
    join: async () => {
      const res = await fetch(tournamentCallApi(`${tournamentId}/join`), {
        method: "POST",
        credentials: "include",
      });
      return res.json();
    },
    fetchParticipants: () => fetchTournamentWebcamParticipants(tournamentId),
    kick: async (steamId) => {
      try {
        const res = await fetch(tournamentCallApi(`${tournamentId}/kick/${steamId}`), {
          method: "POST",
          credentials: "include",
        });
        return await res.json();
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
