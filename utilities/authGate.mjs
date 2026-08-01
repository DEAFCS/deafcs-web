export const PRIVATE_GATE_PUBLIC_PATHS = ["/", "/login"];

export function isAuthTransportRoute(path) {
  return (
    path === "/auth" ||
    path.startsWith("/auth/") ||
    path === "/logout" ||
    path.startsWith("/logout/") ||
    path === "/error" ||
    path.startsWith("/error/")
  );
}

export function isPrivateGatePublicRoute(path) {
  return PRIVATE_GATE_PUBLIC_PATHS.includes(path) || isAuthTransportRoute(path);
}

export function getPrivateGateRedirect(path, { hasMe, canPassGate }) {
  if (isAuthTransportRoute(path) || path === "/") {
    return null;
  }

  if (path === "/login") {
    return hasMe ? "/" : null;
  }

  return canPassGate ? null : "/";
}
