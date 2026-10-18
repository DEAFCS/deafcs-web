import {
  utilityAccessOption,
  utilityInviteLinkReaches,
} from "~/utilities/utilityPracticeAccess";

/**
 * Join Pracc from the friends list (DEAFCS).
 *
 * The list only ever offers a session through the same door a shared invite
 * link opens -- /utility/<map>?practice=<code> -- so the API's join decides
 * access, capacity and whether the session is still live, exactly as it does
 * for a pasted link. This only answers "is there one worth offering".
 */
export type FriendPracticeSession = {
  id: string;
  host_steam_id: string;
  map_name: string | null;
  status: string | null;
  access: string | null;
  is_open?: boolean | null;
  invite_code: string | null;
};

// Ready only: a Starting session has no server yet, and join refuses it.
const JOINABLE_STATUS = "Ready";

export function joinablePracticeFor(
  friendSteamId: string | number | null | undefined,
  sessions: ReadonlyArray<FriendPracticeSession>,
  mySteamId: string | number | null | undefined,
): FriendPracticeSession | null {
  const friend = String(friendSteamId ?? "");

  if (!friend || friend === String(mySteamId ?? "")) {
    return null;
  }

  return (
    sessions.find(
      (session) =>
        String(session.host_steam_id) === friend &&
        session.status === JOINABLE_STATUS &&
        // Open and Friends are the two a link (and so this button) can open;
        // Invite and Private decide on a list it has no say in.
        utilityInviteLinkReaches(
          utilityAccessOption(session.access, session.is_open).value,
        ) &&
        !!session.invite_code &&
        !!session.map_name,
    ) ?? null
  );
}

export function practiceJoinPath(session: FriendPracticeSession): string {
  return `/utility/${encodeURIComponent(session.map_name ?? "")}?practice=${encodeURIComponent(
    session.invite_code ?? "",
  )}`;
}
