// Facebook/FACEIT-style "you're missing something" attention-getter:
// while the DEAFCS tab is in the background (not visible, or visible
// but not the focused window), alternates the browser tab's title and
// favicon between an alert state and the normal one, so it's
// noticeable from the taskbar/tab strip without needing sound. Stops
// automatically the moment the user actually looks back at the tab.
//
// Two independent callers use this: MatchmakingConfirm.vue for a
// match found (fixed text, no counter -- it's a single event with its
// own full-screen popup already), and useChatTabs.ts's incrementUnread
// for new chat messages (a running "(N) New Message" count, Facebook
// tab-badge style, bumped in place without restarting the flash). A
// match-found alert always takes priority over a chat bump if both are
// live at once, since it's the one with an actual accept deadline.

type FlashKind = "match" | "chat";

let flashInterval: ReturnType<typeof setInterval> | null = null;
let flashOn = false;
let activeKind: FlashKind | null = null;
let getFlashText: (() => string) | null = null;
let chatBadgeCount = 0;
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

function registerStopListeners() {
  if (listenersRegistered || typeof document === "undefined") return;
  listenersRegistered = true;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.hasFocus()) stopTabFlash();
  });
  window.addEventListener("focus", () => stopTabFlash());
}

async function ensureFlashing(
  kind: FlashKind,
  computeText: () => string,
): Promise<void> {
  if (typeof document === "undefined" || !shouldFlash()) return;

  // A match-found alert has an actual accept deadline -- don't let a
  // chat bump steal the title/favicon out from under it.
  if (activeKind === "match" && kind === "chat") return;

  activeKind = kind;
  getFlashText = computeText;

  if (flashInterval) return;

  registerStopListeners();

  originalTitle = document.title;
  const iconLinks = getIconLinks();
  originalIconHrefs = iconLinks.map((el) => ({ el, href: el.href }));

  const alertIcon = await getAlertIconDataUrl();
  // Bail if focus was regained while the icon was being generated.
  if (!shouldFlash()) return;

  flashOn = false;
  flashInterval = setInterval(() => {
    flashOn = !flashOn;
    document.title = flashOn
      ? (getFlashText?.() ?? (originalTitle ?? document.title))
      : (originalTitle ?? document.title);
    if (alertIcon && originalIconHrefs) {
      for (const { el, href } of originalIconHrefs) {
        el.href = flashOn ? alertIcon : href;
      }
    }
  }, 1000);
}

// Match found -- fixed text for the whole flash, no running counter.
export function startTabFlash(label: string): Promise<void> {
  return ensureFlashing("match", () => label);
}

// New chat message -- a running "(N) New Message" count, bumped by one
// on every call rather than restarting the flash from scratch, same as
// Facebook's tab-title unread badge.
export function bumpChatTabFlashBadge(): void {
  chatBadgeCount += 1;
  void ensureFlashing("chat", () => `(${chatBadgeCount}) New Message`);
}

export function stopTabFlash(): void {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  activeKind = null;
  getFlashText = null;
  chatBadgeCount = 0;
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
