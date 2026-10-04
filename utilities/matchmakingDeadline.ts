// The ready check's deadline translated to this device's clock, using the
// server time sent with the same update. Without it a PC whose clock runs
// ahead sees the check as already expired (or with only seconds left) and
// never gets the Accept popup, even though the server is still waiting.
export function localConfirmationExpiry(confirmation?: {
  expiresAt?: string;
  serverNow?: string;
  receivedAt?: number;
}): number | undefined {
  if (!confirmation?.expiresAt) {
    return undefined;
  }

  const expiresAt = new Date(confirmation.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return undefined;
  }

  const serverNow = confirmation.serverNow
    ? new Date(confirmation.serverNow).getTime()
    : NaN;
  if (!Number.isFinite(serverNow) || typeof confirmation.receivedAt !== "number") {
    // Older server or no arrival time: the device clock is all there is.
    return expiresAt;
  }

  return expiresAt - (serverNow - confirmation.receivedAt);
}
