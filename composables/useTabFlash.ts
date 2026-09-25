// Facebook/FACEIT-style "you're missing something" attention-getter:
// while the DEAFCS tab is switched away from (not the active tab, or
// the window is minimized), alternates the browser tab's title and
// favicon between an alert state and the normal one. While the tab IS
// the active one, it stops blinking but keeps a steady "(N) <title>"
// count visible instead of clearing outright, live-updating as
// messages actually get read -- see setChatFlashCount.
//
// Deliberately keyed off document.hidden alone, not window focus.
// Reported bug: the blink fired just from another *application* having
// OS focus while Chrome sat in the background with the DEAFCS tab
// still selected/visible -- from the player's point of view they were
// still "on" the tab, just not looking at the Chrome window at that
// exact moment, so this must not count as "switched away".
//
// Two independent sources feed this: MatchmakingConfirm.vue calls
// startTabFlash/stopTabFlash directly (a match found is a single event
// with its own explicit resolution -- accepted, declined, or expired,
// and its own full-screen popup covers the "still visible" case, so it
// only ever blinks, never shows a static badge). setChatFlashCount is
// kept continuously in sync with the real total unread count (see
// plugins/chatTabFlash.client.ts) rather than being bumped once per
// message and forgotten -- switching to the tab only clears the visual
// blink, the underlying count keeps tracking the true unread total.
// A match-found alert always wins over a chat count if both are live,
// since only one of them has an actual accept deadline.

type VisualState = "blink" | "static" | "clear";

let currentVisualState: VisualState = "clear";
let flashInterval: ReturnType<typeof setInterval> | null = null;
let flashOn = false;
let matchLabel: string | null = null;
let chatCount = 0;

// The "real" title/icons underneath our own override -- re-adopted
// automatically whenever the page's own title changes out from under
// us (e.g. a route navigation), detected by comparing against the last
// value we ourselves set.
let baseTitle: string | null = null;
let lastSetTitle: string | null = null;
let originalIconHrefs: Array<{ el: HTMLLinkElement; href: string }> | null =
  null;
let alertIconDataUrl: string | null = null;
let alertIconPromise: Promise<string | null> | null = null;
let listenersRegistered = false;

function shouldFlash(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden;
}

function currentAlertText(): string | null {
  if (matchLabel !== null) return matchLabel;
  if (chatCount > 0) return `(${chatCount}) New Message`;
  return null;
}

function captureBaseTitleIfNeeded(): void {
  if (typeof document === "undefined") return;
  if (lastSetTitle === null || document.title !== lastSetTitle) {
    baseTitle = document.title;
  }
}

function setTitle(text: string): void {
  if (typeof document === "undefined") return;
  document.title = text;
  lastSetTitle = text;
}

function staticTitleText(): string | null {
  if (matchLabel !== null) return null; // match found only ever blinks
  if (chatCount <= 0) return null;
  captureBaseTitleIfNeeded();
  return `(${chatCount}) ${baseTitle ?? ""}`.trim();
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

function captureIconsIfNeeded(): void {
  if (originalIconHrefs || typeof document === "undefined") return;
  originalIconHrefs = getIconLinks().map((el) => ({ el, href: el.href }));
}

function setIconsAlert(useAlert: boolean, alertIcon: string | null): void {
  if (!originalIconHrefs) return;
  for (const { el, href } of originalIconHrefs) {
    el.href = useAlert && alertIcon ? alertIcon : href;
  }
}

function clearAll(): void {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  if (typeof document !== "undefined") {
    captureBaseTitleIfNeeded();
    if (baseTitle !== null) setTitle(baseTitle);
    if (originalIconHrefs) {
      for (const { el, href } of originalIconHrefs) {
        el.href = href;
      }
      originalIconHrefs = null;
    }
  }
  flashOn = false;
  currentVisualState = "clear";
}

async function applyBlink(): Promise<void> {
  if (typeof document === "undefined") return;
  captureBaseTitleIfNeeded();
  captureIconsIfNeeded();
  const alertIcon = await getAlertIconDataUrl();

  // Re-check nothing changed while the icon was being generated.
  if (!shouldFlash() || currentAlertText() === null) return;
  if (currentVisualState === "blink") return;

  if (flashInterval) clearInterval(flashInterval);
  currentVisualState = "blink";
  flashOn = false;
  flashInterval = setInterval(() => {
    const text = currentAlertText();
    if (text === null || !shouldFlash()) {
      syncFlashState();
      return;
    }
    flashOn = !flashOn;
    setTitle(flashOn ? text : (baseTitle ?? text));
    setIconsAlert(flashOn, alertIcon);
  }, 1000);
}

function applyStatic(): void {
  if (typeof document === "undefined") return;
  const text = staticTitleText();
  if (text === null) {
    clearAll();
    return;
  }
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  captureIconsIfNeeded();
  setTitle(text);
  getAlertIconDataUrl().then((icon) => setIconsAlert(true, icon));
  currentVisualState = "static";
}

// The Badging API puts a numeric badge directly on the taskbar/dock
// icon for an installed PWA window -- unlike the title/favicon above,
// this isn't tied to tab visibility at all (that's the whole point of
// it), so it's the one piece of this that actually reaches the PC
// taskbar icon itself rather than just the in-browser tab. Unsupported
// in a plain (non-installed) browser tab, where it's a silent no-op.
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

  if (currentAlertText() === null) {
    clearAll();
    return;
  }

  if (shouldFlash()) {
    void applyBlink();
  } else {
    applyStatic();
  }
}

function registerListeners(): void {
  if (listenersRegistered || typeof document === "undefined") return;
  listenersRegistered = true;
  document.addEventListener("visibilitychange", syncFlashState);
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
