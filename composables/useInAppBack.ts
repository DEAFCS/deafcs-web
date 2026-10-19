import { onBeforeUnmount, ref } from "vue";

// DEAFCS: a phone (and the installed app, which has no browser Back button)
// gets a Back arrow in the top bar. Upstream 5Stack has no global Back; it
// relies on the browser's and on per-page "Back to ..." links, so this stays a
// thin layer over vue-router's own history.
//
// vue-router writes `back` into history.state for every entry it creates: the
// in-app path the user came from, or null on the first entry (a cold launch of
// the app, a link from another site, a new tab). Only a non-null `back` shows
// the arrow, so it can never take the user out of DEAFCS.

// Pages that already carry their own Back link; a second arrow would only
// repeat it.
export const CONTEXTUAL_BACK_ROUTES = new Set<string>([
  "awards-id",
  "awards-manage",
  "chat-tabId",
  "dedicated-servers-serverId-files",
  "matches-id-chat-log",
  "news-slug",
  "news-manage-id",
  "stream-deck-matchId",
]);

export function hasInAppBack(state: unknown): boolean {
  const back = (state as { back?: unknown } | null)?.back;
  return (
    typeof back === "string" && back.startsWith("/") && !back.startsWith("//")
  );
}

export function showsGlobalBack(
  routeName: string | symbol | null | undefined,
  state: unknown,
): boolean {
  if (typeof routeName === "string" && CONTEXTUAL_BACK_ROUTES.has(routeName)) {
    return false;
  }
  return hasInAppBack(state);
}

function pathOf(location: string) {
  return location.split(/[?#]/)[0].replace(/(.)\/$/, "$1");
}

// True when the previous in-app entry is the page `to` names (its query, e.g.
// a list's filters, may differ: Back keeps the ones the user had).
export function previousEntryIs(state: unknown, to: string): boolean {
  if (!hasInAppBack(state)) {
    return false;
  }
  return pathOf((state as { back: string }).back) === pathOf(to);
}

// Click handler for a "Back to ..." link: steps back when that page is the
// previous entry, else lets the link navigate. Modified clicks (new tab,
// new window) always keep the link.
export function useBackToLink() {
  const router = useRouter();
  return (
    event: MouseEvent,
    to: string,
    navigate: (event?: MouseEvent) => unknown,
  ) => {
    const plain =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;
    if (
      plain &&
      !event.defaultPrevented &&
      previousEntryIs(window.history.state, to)
    ) {
      event.preventDefault();
      router.back();
      return;
    }
    navigate(event);
  };
}

export function useInAppBack() {
  const router = useRouter();
  const route = useRoute();
  const visible = ref(false);

  // Takes the route being entered: Nuxt's useRoute() in the layout only moves
  // to it once the new page has rendered.
  const refresh = (name: string | symbol | null | undefined) => {
    visible.value =
      typeof window !== "undefined" &&
      showsGlobalBack(name, window.history.state);
  };

  refresh(route.name);
  const stop = router.afterEach((to) => refresh(to.name));
  onBeforeUnmount(stop);

  function goBack() {
    // Re-checked at the tap: never step back past the app's first entry.
    if (!hasInAppBack(window.history.state)) {
      visible.value = false;
      return;
    }
    router.back();
  }

  return { visible, goBack };
}
