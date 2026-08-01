export declare const PRIVATE_GATE_PUBLIC_PATHS: readonly string[];

export declare function isAuthTransportRoute(path: string): boolean;

export declare function isPrivateGatePublicRoute(path: string): boolean;

export declare function getPrivateGateRedirect(
  path: string,
  state: { hasMe: boolean; canPassGate: boolean },
): string | null;
