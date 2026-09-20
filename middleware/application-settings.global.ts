import { e_player_roles_enum } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";

export default defineNuxtRouteMiddleware((to) => {
  if (process.server || !to.path.startsWith("/settings/application")) return;

  if (!useAuthStore().isRoleAbove(e_player_roles_enum.administrator)) {
    return navigateTo("/");
  }
});
