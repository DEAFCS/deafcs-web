import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

// Scoped to a shared expanded scoreboard. Null explicitly keeps tournament
// rows neutral instead of highlighting the signed-in viewer.
const FOCUS_ROW_STEAM_ID: InjectionKey<Ref<string | null>> = Symbol("focusRowSteamId");
export function provideFocusRow(steamId: Ref<string | null>) {
  provide(FOCUS_ROW_STEAM_ID, steamId);
}
export function useFocusRow() {
  return inject(FOCUS_ROW_STEAM_ID, null);
}

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
  const focusSteamId = useFocusRow();
  const meSteamId = computed(() => {
    if (focusSteamId) return focusSteamId.value;
    const id = useAuthStore().me?.steam_id;
    return id ? String(id) : null;
  });

  function isCurrentUser(member: any): boolean {
    const my = meSteamId.value;
    if (!my) return false;
    const theirs = member?.steam_id ?? member?.player?.steam_id;
    if (!theirs) return false;
    return String(theirs) === my;
  }

  return {
    isCurrentUser,
    rowClass: (member) =>
      focusSteamId && isCurrentUser(member) ? "bg-[hsl(var(--tac-amber)/0.06)]" : "",
    stickyCellClass: (member) =>
      focusSteamId && isCurrentUser(member)
        ? "bg-card group-hover:bg-muted shadow-[inset_2px_0_0_hsl(var(--tac-amber)/0.55),3px_0_6px_-3px_hsl(0_0%_0%/0.7)]"
        : "",
    meSteamId,
  };
}
