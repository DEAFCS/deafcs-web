import {
  computed,
  effectScope,
  ref,
  watch,
  onScopeDispose,
  getCurrentScope,
  type EffectScope,
} from "vue";
import { useDocumentVisibility } from "@vueuse/core";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { currentHub } from "~/composables/useHubState";

// Friends who came online since you last looked at Friends. Not an alert: the
// dock marks them as new until the Friends app has been on screen for a
// moment. Kept per browser, since "seen" is about this screen.
//
// A friend reloading their tab drops off the roster for a second. That isn't
// coming online, so an absence shorter than OFFLINE_GRACE_MS doesn't count.
//
// Seeing them clears the dock straight away, but the list keeps marking who
// arrived (visitArrivals) until you leave Friends -- otherwise the marks would
// vanish a second after you opened it to find out who it was.
//
// Opening Friends must not change the list: the list's move animation measures
// its rows before an update, and on the opening frame the card is still
// hidden, so every row measured at 0,0 and flew in from the side. While Friends
// is closed the marks simply follow what's new, and opening holds that very
// array; they are let go only once the card has finished leaving.

const STORAGE_KEY = "hub-friends-seen-online";
const OFFLINE_GRACE_MS = 2 * 60 * 1000;
// Long enough that sweeping past Friends on the way to another app doesn't
// count as having looked.
const LOOK_MS = 800;

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"),
    );
  } catch {
    return new Set();
  }
}

const seen = ref(readSeen());
const onlineIds = ref<string[]>([]);
const heldArrivals = ref<string[] | null>(null);
// When each friend was seen coming online, newest first in the list; friends
// already online when this tab loaded sort last.
const arrivedAt = new Map<string, number>();
let tracker: EffectScope | null = null;
let consumers = 0;
const arrivalId = ref<string | null>(null);
const arrivalSerial = ref(0);
export const FRIEND_ARRIVAL_MS = 4000;

// Newest arrival first.
const newlyOnline = computed(() =>
  onlineIds.value
    .filter((id) => !seen.value.has(id))
    .sort((a, b) => (arrivedAt.get(b) ?? 0) - (arrivedAt.get(a) ?? 0)),
);

const visitArrivals = computed(() => heldArrivals.value ?? newlyOnline.value);

function writeSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen.value]));
  } catch {
    // A blocked store only means "new" resets with the visit.
  }
}

function track() {
  const store = useMatchmakingStore();
  const { rightSidebarOpen } = useRightSidebar();
  const visibility = useDocumentVisibility();
  const offlineAt = new Map<string, number>();
  let previous: Set<string> | null = null;
  let arrivalTimer: ReturnType<typeof setTimeout> | null = null;
  function announce(id: string) {
    if (arrivalTimer) clearTimeout(arrivalTimer);
    arrivalId.value = id;
    arrivalSerial.value++;
    arrivalTimer = setTimeout(() => {
      arrivalTimer = null;
      arrivalId.value = null;
    }, FRIEND_ARRIVAL_MS);
  }

  const friendsOpen = computed(
    () => rightSidebarOpen.value && currentHub() === "social",
  );
  const looking = computed(
    () => friendsOpen.value && visibility.value === "visible",
  );

  // DEAFCS: hasOnlinePlayerSnapshot is this store's "presence has loaded"
  // (upstream's presenceLoaded).
  watch(
    () =>
      store.hasOnlinePlayerSnapshot
        ? (store.onlineFriends ?? []).map((friend: any) =>
            String(friend.steam_id),
          )
        : null,
    (ids) => {
      if (!ids) return;
      const now = Date.now();
      const current = new Set(ids);
      if (!previous) {
        // Seen last visit but offline now: new again when they come back.
        seen.value = new Set([...seen.value].filter((id) => current.has(id)));
      } else {
        for (const id of current) {
          if (previous.has(id)) continue;
          const wentAt = offlineAt.get(id);
          offlineAt.delete(id);
          if (wentAt === undefined || now - wentAt >= OFFLINE_GRACE_MS) {
            arrivedAt.set(id, now);
            seen.value.delete(id);
            announce(id);
          }
        }
        for (const id of previous) {
          if (!current.has(id)) offlineAt.set(id, now);
        }
      }
      previous = current;
      onlineIds.value = ids;
      if (arrivalId.value && !current.has(arrivalId.value)) {
        if (arrivalTimer) clearTimeout(arrivalTimer);
        arrivalTimer = null;
        arrivalId.value = null;
      }

      // While Friends is open, whoever is new joins this visit's marks, and
      // whoever left drops out of them.
      if (heldArrivals.value) {
        const next = [
          ...new Set([
            ...newlyOnline.value,
            ...heldArrivals.value.filter((id) => current.has(id)),
          ]),
        ];
        if (next.join() !== heldArrivals.value.join()) {
          heldArrivals.value = next;
        }
      }
      writeSeen();
    },
    { immediate: true },
  );

  // Long enough for the card's leave transition to finish.
  const RELEASE_MS = 400;
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;
  watch(friendsOpen, (open) => {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
    if (open) {
      if (!heldArrivals.value) heldArrivals.value = newlyOnline.value;
      return;
    }
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      heldArrivals.value = null;
    }, RELEASE_MS);
  });

  let lookTimer: ReturnType<typeof setTimeout> | null = null;

  function markSeen() {
    for (const id of onlineIds.value) seen.value.add(id);
    writeSeen();
  }

  watch(
    looking,
    (isLooking) => {
      if (lookTimer) clearTimeout(lookTimer);
      lookTimer = null;
      if (isLooking) {
        lookTimer = setTimeout(() => {
          lookTimer = null;
          markSeen();
        }, LOOK_MS);
      }
    },
    { immediate: true },
  );

  // Someone arriving while you are already looking is seen as they arrive.
  watch(onlineIds, () => {
    if (looking.value && !lookTimer) markSeen();
  });
  onScopeDispose(() => {
    if (arrivalTimer) clearTimeout(arrivalTimer);
    if (lookTimer) clearTimeout(lookTimer);
    if (releaseTimer) clearTimeout(releaseTimer);
    arrivalId.value = null;
    heldArrivals.value = null;
  });
}

export function useFriendArrivals() {
  if (!tracker && typeof window !== "undefined") {
    tracker = effectScope(true);
    tracker.run(track);
  }
  if (getCurrentScope()) {
    consumers++;
    onScopeDispose(() => {
      if (--consumers === 0) {
        tracker?.stop();
        tracker = null;
      }
    });
  }

  return { newlyOnline, visitArrivals, arrivalId, arrivalSerial };
}
