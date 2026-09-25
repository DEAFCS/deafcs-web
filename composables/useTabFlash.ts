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
// Four independent sources feed this, in priority order:
//   1. startCallFlash/stopCallFlash -- an incoming webcam call ring
//      (GlobalAdminCallNotifier.vue / GlobalVerificationCallNotifier.vue).
//      Cleared only by an explicit accept/decline/timeout, never by
//      just glancing at the tab.
//   2. startTabFlash/stopTabFlash -- a match found (MatchmakingConfirm.vue).
//      Same "explicit resolution only" contract as calls.
//   3/4. setChatFlashCount / setAlertFlashCount -- kept continuously in
//      sync with their own real unread total (see
//      plugins/chatTabFlash.client.ts) rather than bumped once per
//      event and forgotten.
// A call or match-found alert always wins over a chat/alert count if
// several are live at once, since those are the ones with an actual
// response deadline.
//
// Chat/alert counts additionally remember how much the player has
// already been shown while the tab was visible (acknowledgedCount) --
// reported: glancing at the tab without actually reading anything
// still made the blink come right back the next time it lost focus.
// Looking at the tab now silences the blink for whatever total was
// visible at that moment; it only resumes if the total climbs past
// that point, i.e. a genuinely new message or alert arrives.

type VisualState = "blink" | "static" | "clear";

let currentVisualState: VisualState = "clear";
let flashInterval: ReturnType<typeof setInterval> | null = null;
let flashOn = false;
let callLabel: string | null = null;
let matchLabel: string | null = null;
let chatCount = 0;
let alertCount = 0;
let acknowledgedCount = 0;

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

function totalBadgeCount(): number {
  return chatCount + alertCount;
}

function hasNewCountSinceAcknowledged(): boolean {
  return totalBadgeCount() > acknowledgedCount;
}

function countAlertText(): string | null {
  if (!hasNewCountSinceAcknowledged()) return null;
  const total = totalBadgeCount();
  return `(${total}) New Message`;
}

function currentAlertText(): string | null {
  return callLabel ?? matchLabel ?? countAlertText();
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
  if (callLabel !== null || matchLabel !== null) return null; // these only ever blink
  const total = totalBadgeCount();
  if (total <= 0) return null;
  captureBaseTitleIfNeeded();
  return `(${total}) ${baseTitle ?? ""}`.trim();
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
  // Whatever's visible right now is, by definition, seen -- freezes the
  // threshold the next blink (if any) has to climb past. Runs even when
  // there's nothing to show (total 0), which just re-syncs it to 0.
  acknowledgedCount = totalBadgeCount();

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
// this isn't tied to tab visibility (or acknowledgment) at all (that's
// the whole point of it), so it's the one piece of this that actually
// reaches the PC taskbar icon itself rather than just the in-browser
// tab. Unsupported in a plain (non-installed) browser tab, where it's
// a silent no-op.
function updateAppBadge(): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.setAppBadge !== "function") return;

  const badgeCount =
    (callLabel !== null ? 1 : 0) +
    (matchLabel !== null ? 1 : 0) +
    totalBadgeCount();
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

// Incoming call ring -- fixed text, cleared only by an explicit
// stopCallFlash() call (accepted, declined, or timed out), never just
// by looking at the tab.
export function startCallFlash(label: string): void {
  if (typeof document === "undefined") return;
  registerListeners();
  callLabel = label;
  syncFlashState();
}

export function stopCallFlash(): void {
  callLabel = null;
  syncFlashState();
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

// Alert-bell total (news, invites, sanctions, admin alerts, …) -- same
// live-count contract as setChatFlashCount, just fed from the bell's
// own unreadNotificationCount instead of chat's unreadCounts.
export function setAlertFlashCount(count: number): void {
  if (typeof document === "undefined") return;
  registerListeners();
  alertCount = Math.max(0, count);
  syncFlashState();
}
