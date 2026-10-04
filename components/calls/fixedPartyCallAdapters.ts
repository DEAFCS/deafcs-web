import {
  joinVerificationCall,
  fetchVerificationCallParticipants,
  fetchVerificationCallStatus,
  verificationCallJoinUrl,
  verificationCallPeerWhepUrl,
  verificationCallPlayerWhipUrl,
  verificationCallPlayerStatusUrl,
  verificationCallPlayerHangupUrl,
} from "~/composables/useVerificationCallApi";
import {
  joinAdminCall,
  fetchAdminCallParticipants,
  fetchAdminCallStatus,
  adminCallJoinUrl,
  adminCallPeerWhepUrl,
  adminCallPlayerWhipUrl,
  adminCallPlayerStatusUrl,
  adminCallPlayerHangupUrl,
} from "~/composables/useAdminCallApi";

// The two fixed two-party webcam calls (verification application call and
// the admin call from a player profile) differ only in which endpoints and
// which "answered" socket event they use. FixedPartyCall.vue takes one of
// these adapters; every request, token and URL is exactly the existing
// composable call, nothing is re-implemented here.
export type FixedPartyCallParticipant = {
  steamId: string;
  name: string | null;
  avatarUrl: string | null;
};

export interface FixedPartyCallAdapter {
  join(): Promise<{
    token: string;
    participants: FixedPartyCallParticipant[];
    error?: string;
  }>;
  participants(): Promise<FixedPartyCallParticipant[]>;
  status(token: string): Promise<{ ready: boolean }>;
  // Page the phone opens by scanning the QR code (token-gated, no login).
  joinUrl(token: string): string;
  peerWhepUrl(steamId: string): string;
  whipUrl(token: string): string;
  hangupUrl(token: string): string;
  // Socket event telling the ringing admin whether the call was answered.
  responseEvent: string;
  isOwnResponse(data: Record<string, unknown>): boolean;
}

export function verificationCallAdapter(
  applicationId: string,
): FixedPartyCallAdapter {
  return {
    join: () => joinVerificationCall(applicationId),
    participants: () => fetchVerificationCallParticipants(applicationId),
    status: (token) =>
      fetchVerificationCallStatus(verificationCallPlayerStatusUrl(token)),
    joinUrl: (token) => verificationCallJoinUrl(applicationId, token),
    peerWhepUrl: (steamId) => verificationCallPeerWhepUrl(applicationId, steamId),
    whipUrl: (token) => verificationCallPlayerWhipUrl(token),
    hangupUrl: (token) => verificationCallPlayerHangupUrl(token),
    responseEvent: "verification-call:response",
    isOwnResponse: (data) => data.applicationId === applicationId,
  };
}

export function adminCallAdapter(targetSteamId: string): FixedPartyCallAdapter {
  return {
    join: () => joinAdminCall(targetSteamId),
    participants: () => fetchAdminCallParticipants(targetSteamId),
    status: (token) => fetchAdminCallStatus(adminCallPlayerStatusUrl(token)),
    joinUrl: (token) => adminCallJoinUrl(targetSteamId, token),
    peerWhepUrl: (steamId) => adminCallPeerWhepUrl(targetSteamId, steamId),
    whipUrl: (token) => adminCallPlayerWhipUrl(token),
    hangupUrl: (token) => adminCallPlayerHangupUrl(token),
    responseEvent: "admin-call:response",
    isOwnResponse: (data) => data.targetSteamId === targetSteamId,
  };
}
