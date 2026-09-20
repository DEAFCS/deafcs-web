import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";
import { useAuthStore } from "~/stores/AuthStore";

export default defineNuxtRouteMiddleware(() => {
  if (process.server) return;

  const minimumRole = useApplicationSettingsStore().tournamentCreateRole;
  if (!useAuthStore().isRoleAbove(minimumRole)) {
    return navigateTo("/tournaments");
  }
});
