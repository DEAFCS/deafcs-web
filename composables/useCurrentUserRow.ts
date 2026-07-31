import { computed, type ComputedRef } from "vue";

// The currently logged-in player is identified by coloring their own name
// text (see PlayerDisplay's `highlightSelf` prop and the mobile name link
// below) rather than a row/cell background treatment — a left-edge shadow
// rail there used to clash with the lobby/party color tick.

export function useCurrentUserRow(): {
  isCurrentUser: (member: any) => boolean;
  rowClass: (member: any) => string;
  stickyCellClass: (member: any) => string;
  meSteamId: ComputedRef<string | null>;
} {
  const meSteamId = computed(() => {
    const id = useAuthStore().me?.steam_id;
    return id ? String(id) : null;
  });

  function isCurrentUser(member: any): boolean {
    const my = meSteamId.value;
    if (!my) return false;
    const theirs = member?.steam_id;
    if (!theirs) return false;
    return String(theirs) === my;
  }

  return {
    isCurrentUser,
    rowClass: () => "",
    stickyCellClass: () => "",
    meSteamId,
  };
}
