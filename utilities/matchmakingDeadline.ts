// Server timestamps (a ready check's deadline, when a lobby joined the queue)
// translated to this device's clock, using the server time sent with the same
// update. A device clock that is off would otherwise hide the accept popup or
// start the search timer at the wrong number.
interface ServerClock {
  serverNow?: string;
  receivedAt?: number;
}

export function localServerTime(
  time: string | undefined,
  clock: ServerClock | undefined,
): number | undefined {
  if (!time) {
    return undefined;
  }

  const serverTime = new Date(time).getTime();
  if (!Number.isFinite(serverTime)) {
    return undefined;
  }

  const serverNow = clock?.serverNow ? new Date(clock.serverNow).getTime() : NaN;
  if (!Number.isFinite(serverNow) || typeof clock?.receivedAt !== "number") {
    // Older server or no arrival time: the device clock is all there is.
    return serverTime;
  }

  return serverTime - (serverNow - clock.receivedAt);
}

// The ready check's deadline on this device's clock. Without the correction a
// PC whose clock runs ahead sees the check as already expired (or with only
// seconds left) and never gets the Accept popup.
export function localConfirmationExpiry(
  confirmation?: { expiresAt?: string } & ServerClock,
): number | undefined {
  return localServerTime(confirmation?.expiresAt, confirmation);
}
