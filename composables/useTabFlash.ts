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

// Whether there's a chat/alert count to display at all -- deliberately
// NOT gated on acknowledgment, in either visibility state. Reported
// bug: switching to a different browser tab made an already-
// acknowledged "(1)" disappear from the DEAFCS tab entirely instead of
// just no longer blinking for it -- a still-unread count should stay
// visibly parked in the tab title/favicon the whole time it's genuinely
// unread, calm or not; only whether it's currently *blinking* depends
// on acknowledgment (see hasNewCountSinceAcknowledged).
function hasAnythingToShow(): boolean {
  return totalBadgeCount() > 0;
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

  if (callLabel !== null || matchLabel !== null) {
    // A call ring or match found has no "calm, already-seen" state --
    // it's either actively blinking for attention (hidden) or relying
    // on its own full-screen in-app popup to do that job (visible), and
    // only ever clears via an explicit accept/decline/resolve/timeout.
    if (shouldFlash()) {
      void applyBlink();
    } else {
      clearAll();
    }
    return;
  }

  if (!hasAnythingToShow()) {
    clearAll();
    return;
  }

  // A still-unread chat/alert count stays visibly parked in the title/
  // favicon the whole time it's genuinely unread, hidden or visible --
  // reported bug: switching to a different browser tab made an
  // already-acknowledged count vanish from DEAFCS's own tab entirely
  // instead of just no longer blinking for it. Only whether it's
  // actively *blinking* right now depends on acknowledgment.
  if (shouldFlash() && hasNewCountSinceAcknowledged()) {
    void applyBlink();
  } else {
    applyStatic();
  }
}

// Seeded (not treated as a transition) the first time registerListeners
// runs, then tracks the actual hidden/visible state across real
// visibilitychange events so a hidden->visible flip can be told apart
// from "the count just changed while already visible".
let previouslyHidden: boolean | null = null;

function registerListeners(): void {
  if (typeof document === "undefined") return;
  if (previouslyHidden === null) previouslyHidden = shouldFlash();
  if (listenersRegistered) return;
  listenersRegistered = true;
  document.addEventListener("visibilitychange", () => {
    const hiddenNow = shouldFlash();
    if (previouslyHidden === true && hiddenNow === false) {
      // Reported bug: a bell alert or chat message that arrived while
      // the tab was already visible got marked "seen" the instant it
      // arrived (acknowledgedCount used to be re-synced on every static
      // render, not just on an actual hidden->visible transition), so
      // it silently never blinked on the next switch-away at all.
      // Acknowledging only happens here now -- an explicit "the player
      // just looked back at a tab that was hidden" moment -- so a
      // count that only ever changed while the tab stayed visible the
      // whole time still correctly alerts once they do leave.
      acknowledgedCount = totalBadgeCount();
    }
    previouslyHidden = hiddenNow;
    syncFlashState();
  });
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
