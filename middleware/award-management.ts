export default defineNuxtRouteMiddleware(() => {
  if (process.server) return;

  if (!useApplicationSettingsStore().canManageSharedAwards) {
    return navigateTo("/awards", { replace: true });
  }
});
