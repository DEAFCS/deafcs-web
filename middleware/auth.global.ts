import { useAuthStore } from "~/stores/AuthStore";
import { toast } from "@/components/ui/toast";
import { e_player_roles_enum } from "~/generated/zeus";
import {
  getPrivateGateRedirect,
  isAuthTransportRoute,
} from "~/utilities/authGate";

export default defineNuxtRouteMiddleware(async (to) => {
  if (process.server) return;

  if (to.query.error) {
    const errorMessage = Array.isArray(to.query.error)
      ? to.query.error[0]
      : to.query.error;

    if (typeof errorMessage === "string") {
      toast({
        variant: "destructive",
        title: useNuxtApp().$i18n.t("common.error"),
        description: errorMessage,
      });
    }

    // Remove error from URL to prevent showing toast again on refresh
    const query = { ...to.query };
    delete query.error;
    return navigateTo({
      path: to.path,
      query,
    });
  }

  // Auth and error transport routes belong to the external auth flow. They
  // must remain reachable even while the private pre-launch gate is active.
  if (isAuthTransportRoute(to.path)) {
    return;
  }

  const authStore = useAuthStore();

  // getMe() shares its in-flight promise with the auth store. Awaiting it here
  // prevents a cached identity or a cold session from redirecting too early.
  if (!authStore.hasCheckedSession) {
    await authStore.getMe();
  }

  const hasMe = !!authStore.me?.steam_id;
  // This deliberately uses the existing role hierarchy. verified_user and
  // every role above it (including moderator/organizer/administrator staff)
  // pass the gate; the unverified user role does not.
  const canPassPrivateGate =
    hasMe && authStore.isRoleAbove(e_player_roles_enum.verified_user);

  const gateRedirect = getPrivateGateRedirect(to.path, {
    hasMe,
    canPassGate: canPassPrivateGate,
  });

  if (gateRedirect) {
    return navigateTo(gateRedirect);
  }
});
