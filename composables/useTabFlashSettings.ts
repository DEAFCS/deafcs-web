import { readonly, ref } from "vue";

// Separate on/off switches for the browser-tab flash alert (see
// useTabFlash.ts) -- one per trigger, same split as useSound.ts's chat
// vs match-found sound toggles, so a player can keep one and mute the
// other instead of an all-or-nothing switch.
const isChatFlashEnabled = ref(true);
const isMatchFoundFlashEnabled = ref(true);
let settingsLoaded = false;

export const useTabFlashSettings = () => {
  const loadSettings = () => {
    if (!import.meta.client || settingsLoaded) return;
    settingsLoaded = true;

    const savedChat = localStorage.getItem("tab-flash-chat-enabled");
    const savedMatchFound = localStorage.getItem(
      "tab-flash-match-found-enabled",
    );

    if (savedChat !== null) {
      isChatFlashEnabled.value = savedChat === "true";
    }
    if (savedMatchFound !== null) {
      isMatchFoundFlashEnabled.value = savedMatchFound === "true";
    }
  };

  const updateChatFlashSetting = (enabled: boolean) => {
    isChatFlashEnabled.value = enabled;
    if (import.meta.client) {
      localStorage.setItem("tab-flash-chat-enabled", enabled.toString());
    }
  };

  const updateMatchFoundFlashSetting = (enabled: boolean) => {
    isMatchFoundFlashEnabled.value = enabled;
    if (import.meta.client) {
      localStorage.setItem(
        "tab-flash-match-found-enabled",
        enabled.toString(),
      );
    }
  };

  if (import.meta.client) {
    loadSettings();
  }

  return {
    isChatFlashEnabled: readonly(isChatFlashEnabled),
    isMatchFoundFlashEnabled: readonly(isMatchFoundFlashEnabled),
    updateChatFlashSetting,
    updateMatchFoundFlashSetting,
  };
};
