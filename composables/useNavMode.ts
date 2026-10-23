import { ref, watch } from "vue";
import { useRoute } from "vue-router";

export type NavMode = "play" | "admin";

// Route names (and their children) that belong to the Admin list. A trailing
// dash means "every route that starts with this".
const ADMIN_ROUTES = [
  "settings-application",
  "system-",
  "gpu-nodes",
  "game-server-nodes",
  "dedicated-servers",
  "regions",
  "seasons",
  "support-requests",
  "verification-applications",
  "terms-acceptances",
  "stream-deck",
  "database",
  "events-manage",
  "admin-call",
];

export function isAdminRouteName(name: unknown): boolean {
  if (typeof name !== "string") {
    return false;
  }
  return ADMIN_ROUTES.some((route) =>
    route.endsWith("-")
      ? name.startsWith(route)
      : name === route || name.startsWith(`${route}-`),
  );
}

const mode = ref<NavMode>("play");

function setMode(next: NavMode) {
  mode.value = next;
}

/**
 * The left nav shows one list at a time. Opening an admin page flips it to
 * Admin and any other page flips it back to Play; the switch overrides it until
 * the next navigation.
 */
export function useNavMode() {
  const route = useRoute();

  watch(
    () => route.name,
    (name) => setMode(isAdminRouteName(name) ? "admin" : "play"),
    { immediate: true },
  );

  return {
    mode,
    setMode,
    toggle: () => setMode(mode.value === "admin" ? "play" : "admin"),
  };
}
