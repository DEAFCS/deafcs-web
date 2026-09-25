// Facebook/FACEIT-style "you're missing something" attention-getter:
// while the DEAFCS tab is in the background (not visible, or visible
// but not the focused window), alternates the browser tab's title and
// favicon between an alert state and the normal one, so it's
// noticeable from the tab strip without needing sound.
//
// Two independent sources feed this: MatchmakingConfirm.vue calls
// startTabFlash/stopTabFlash directly (a match found is a single event
// with its own explicit resolution -- accepted, declined, or expired),
// and setChatFlashCount is kept continuously in sync with the real
// total unread count (see plugins/chatTabFlash.client.ts) rather than
// being bumped once per message and forgotten. That distinction is the
// fix for a reported bug: switching back to the tab used to fully
// reset the unread count to zero even though nothing had actually been
// read yet, so switching away again showed nothing until a brand new
// message arrived. Now, looking at the tab only clears the *visual*
// blink -- the underlying count keeps tracking the real unread total,
// decreasing only as messages actually get read, and the blink resumes
// on its own next time the tab loses focus while that total is still
// above zero. A match-found alert always wins over a chat count if
// both are live, since only one of them has an actual accept deadline.

let flashInterval: ReturnType<typeof setInterval> | null = null;
let flashOn = false;
let matchLabel: string | null = null;
let chatCount = 0;
let originalTitle: string | null = null;
let originalIconHrefs: Array<{ el: HTMLLinkElement; href: string }> | null =
  null;
let alertIconDataUrl: string | null = null;
let alertIconPromise: Promise<string | null> | null = null;
let listenersRegistered = false;

function shouldFlash(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden || !document.hasFocus();
}

function currentFlashText(): string | null {
  if (matchLabel !== null) return matchLabel;
  if (chatCount > 0) return `(${chatCount}) New Message`;
  return null;
}

// Draws the existing 64px favicon plus a green alert dot onto a canvas
// and returns it as a data URL, cached after the first call -- this
// avoids shipping a second static icon asset just for this.
async function getAlertIconDataUrl(): Promise<string | null> {
  if (alertIconDataUrl) return alertIconDataUrl;
  if (alertIconPromise) return alertIconPromise;

  alertIconPromise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 64;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);

          const dotRadius = size * 0.22;
          const cx = size - dotRadius - 2;
          const cy = size - dotRadius - 2;

          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius + 3, 0, Math.PI * 2);
          ctx.fillStyle = "#0a0a0a";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#22c55e";
          ctx.fill();

          alertIconDataUrl = canvas.toDataURL("image/png");
          resolve(alertIconDataUrl);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/favicon/64.png?v=deafcs-1";
    } catch {
      resolve(null);
    }
  });

  return alertIconPromise;
}

function getIconLinks(): HTMLLinkElement[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  );
}

function stopVisual(): void {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  if (typeof document === "undefined") return;
  if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }
  if (originalIconHrefs) {
    for (const { el, href } of originalIconHrefs) {
      el.href = href;
    }
    originalIconHrefs = null;
  }
  flashOn = false;
}

async function maybeStartVisual(): Promise<void> {
  if (typeof document === "undefined" || flashInterval) return;
  if (currentFlashText() === null || !shouldFlash()) return;

  originalTitle = document.title;
  const iconLinks = getIconLinks();
  originalIconHrefs = iconLinks.map((el) => ({ el, href: el.href }));

  const alertIcon = await getAlertIconDataUrl();
  // Bail if focus was regained, or there's nothing left to show, while
  // the icon was being generated.
  if (!shouldFlash() || currentFlashText() === null) {
    originalIconHrefs = null;
    originalTitle = null;
    return;
  }

  flashOn = false;
  flashInterval = setInterval(() => {
    flashOn = !flashOn;
    const text = currentFlashText();
    if (text === null) {
      // Read (or resolved) while mid-blink -- clear immediately rather
      // than waiting for the next focus/blur event.
      stopVisual();
      return;
    }
    document.title = flashOn ? text : (originalTitle ?? document.title);
    if (alertIcon && originalIconHrefs) {
      for (const { el, href } of originalIconHrefs) {
        el.href = flashOn ? alertIcon : href;
      }
    }
  }, 1000);
}

// The Badging API puts a numeric badge directly on the taskbar/dock
// icon for an installed PWA window -- unlike the title/favicon blink
// above, this isn't tied to tab focus/visibility at all (that's the
// whole point of it), so it's the one piece of this that actually
// reaches the PC taskbar icon itself rather than just the in-browser
// tab strip. Unsupported in a plain (non-installed) browser tab, where
// it's a silent no-op.
function updateAppBadge(): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.setAppBadge !== "function") return;

  const badgeCount = (matchLabel !== null ? 1 : 0) + chatCount;
  try {
    if (badgeCount > 0) {
      nav.setAppBadge(badgeCount).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  } catch {
    // Unsupported or blocked by the platform -- best effort only.
  }
}

function syncFlashState(): void {
  updateAppBadge();

  if (currentFlashText() === null) {
    stopVisual();
    return;
  }
  if (shouldFlash()) {
    void maybeStartVisual();
  }
  // Otherwise the tab is currently focused: leave the title/favicon
  // alone (already clear, or will be shown next time focus is lost --
  // see the blur/visibilitychange listeners below).
}

function registerListeners(): void {
  if (listenersRegistered || typeof window === "undefined") return;
  listenersRegistered = true;
  const handlePossibleFocusChange = () => {
    if (shouldFlash()) {
      void maybeStartVisual();
    } else {
      stopVisual();
    }
  };
  window.addEventListener("blur", handlePossibleFocusChange);
  window.addEventListener("focus", handlePossibleFocusChange);
  document.addEventListener("visibilitychange", handlePossibleFocusChange);
}

// Match found -- fixed text, cleared only by an explicit stopTabFlash()
// call (accepted, declined, or expired), never just by looking at the
// tab (see the file-level comment above).
export function startTabFlash(label: string): void {
  if (typeof document === "undefined") return;
  registerListeners();
  matchLabel = label;
  syncFlashState();
}

export function stopTabFlash(): void {
  matchLabel = null;
  syncFlashState();
}

// New chat message total -- call with the current real unread count
// (not a delta) every time it changes; see plugins/chatTabFlash.client.ts.
export function setChatFlashCount(count: number): void {
  if (typeof document === "undefined") return;
  registerListeners();
  chatCount = Math.max(0, count);
  syncFlashState();
}
