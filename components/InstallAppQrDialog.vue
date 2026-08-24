<script setup lang="ts">
import { ref, computed, watch } from "vue";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";
import AppleIcon from "~/components/icons/AppleIcon.vue";
import AndroidIcon from "~/components/icons/AndroidIcon.vue";
import PhoneDownloadIcon from "~/components/icons/PhoneDownloadIcon.vue";
import {
  Smartphone,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-vue-next";

// Desktop-only entry point for getting the app onto a *phone* -- this
// replaced the old top-nav InstallPWA icon, which only ever handled
// installing on the device you're already using (irrelevant here,
// since a desktop can't install a PWA "onto" a phone; the phone has
// to do that itself once it loads the site, which is what the QR
// code is for).
type Step = "choose" | "ios" | "android";
const step = ref<Step>("choose");
const iosStepIndex = ref(0); // 0-4, one per public/pwa-install/ios-*.jpg
const dialogOpen = ref(false);

const IOS_STEP_COUNT = 5;

// Both platforms scan the same QR now (straight to the site itself) --
// the old separate Android QR pointed at a DEAFCS.apk download, which is
// retired in favor of installing straight from the browser (see the
// android step below).
const qrDataUrl = ref<string | null>(null);

const joinUrl = computed(() => {
  if (typeof window === "undefined") return "";
  return window.location.origin;
});

watch(
  dialogOpen,
  async (open) => {
    if (!open) return;
    step.value = "choose";
    iosStepIndex.value = 0;
    if (!qrDataUrl.value) {
      qrDataUrl.value = await QRCode.toDataURL(joinUrl.value, {
        width: 220,
        margin: 1,
      });
    }
  },
  { immediate: false },
);

function nextIosStep() {
  if (iosStepIndex.value < IOS_STEP_COUNT - 1) {
    iosStepIndex.value += 1;
  } else {
    dialogOpen.value = false;
  }
}
</script>

<template>
  <FiveStackToolTip>
    <template #trigger>
      <Button size="sm" @click="dialogOpen = true">
        <PhoneDownloadIcon class="w-4 h-4" />
      </Button>
    </template>
    {{ $t("pwa.install_dialog.trigger_tooltip") }}
  </FiveStackToolTip>

  <Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
    <DialogContent class="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t("pwa.install_dialog.title") }}</DialogTitle>
        <DialogDescription>
          {{ $t("pwa.install_dialog.description") }}
        </DialogDescription>
      </DialogHeader>

      <!-- Step 1: pick a device -->
      <div v-if="step === 'choose'" class="grid grid-cols-2 gap-3">
        <button
          type="button"
          class="flex flex-col items-center gap-2 rounded-lg border border-border p-5 hover:border-primary hover:bg-accent transition-colors"
          @click="step = 'ios'"
        >
          <AppleIcon class="w-7 h-7" />
          <span class="text-sm font-medium">{{
            $t("pwa.install_dialog.iphone")
          }}</span>
        </button>
        <button
          type="button"
          class="flex flex-col items-center gap-2 rounded-lg border border-border p-5 hover:border-primary hover:bg-accent transition-colors"
          @click="step = 'android'"
        >
          <AndroidIcon class="w-7 h-7" />
          <span class="text-sm font-medium">{{
            $t("pwa.install_dialog.android")
          }}</span>
        </button>
      </div>

      <!-- Step 2a: iPhone -- small QR alongside the hint text (not a
           big stacked block), then a height-capped screenshot so a
           tall native phone screenshot scales down to fit instead of
           blowing out the dialog's height. -->
      <div v-else-if="step === 'ios'" class="flex flex-col gap-3">
        <button
          type="button"
          class="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          @click="step = 'choose'"
        >
          <ArrowLeft class="w-4 h-4" /> {{ $t("common.back") }}
        </button>

        <div class="flex items-center gap-3 rounded-lg border border-border p-2.5">
          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            alt="QR code"
            width="72"
            height="72"
            class="rounded-md border border-border bg-white p-1 shrink-0"
          />
          <p class="text-xs text-muted-foreground">
            {{ $t("pwa.install_dialog.scan_hint") }}
          </p>
        </div>

        <div class="flex flex-col items-center gap-2">
          <img
            :src="`/pwa-install/ios-${iosStepIndex + 1}.jpg`"
            :alt="$t(`pwa.install_dialog.ios_steps.${iosStepIndex}`)"
            class="max-h-[480px] w-auto rounded-lg border border-border object-contain"
          />
          <p class="text-sm text-center font-medium">
            {{ iosStepIndex + 1 }}. {{ $t(`pwa.install_dialog.ios_steps.${iosStepIndex}`) }}
          </p>
        </div>

        <div class="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="iosStepIndex === 0"
            @click="iosStepIndex -= 1"
          >
            <ChevronLeft class="w-4 h-4" /> {{ $t("common.back") }}
          </Button>
          <span class="text-xs text-muted-foreground font-mono">
            {{ iosStepIndex + 1 }} / {{ IOS_STEP_COUNT }}
          </span>
          <Button size="sm" @click="nextIosStep">
            <template v-if="iosStepIndex < IOS_STEP_COUNT - 1">
              {{ $t("common.next") }} <ChevronRight class="w-4 h-4" />
            </template>
            <template v-else>
              {{ $t("common.done") }}
            </template>
          </Button>
        </div>
      </div>

      <!-- Step 2b: Android -- QR points at the site itself now (the old
           DEAFCS.apk download is retired). Installing straight from
           Chrome's own menu still gets a real installed app with its own
           icon and push notifications, same as before. -->
      <div v-else-if="step === 'android'" class="flex flex-col gap-4">
        <button
          type="button"
          class="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          @click="step = 'choose'"
        >
          <ArrowLeft class="w-4 h-4" /> {{ $t("common.back") }}
        </button>
        <div class="flex items-center gap-3 rounded-lg border border-border p-2.5">
          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            alt="QR code"
            width="72"
            height="72"
            class="rounded-md border border-border bg-white p-1 shrink-0"
          />
          <p class="text-xs text-muted-foreground">
            {{ $t("pwa.install_dialog.android_scan_hint") }}
          </p>
        </div>

        <div class="flex flex-col gap-3 py-1">
          <div class="flex items-center gap-4">
            <MoreVertical class="w-7 h-7 shrink-0" />
            <p class="text-sm text-muted-foreground">
              {{ $t("pwa.install_dialog.android_step1") }}
            </p>
          </div>
          <div class="flex items-center gap-4">
            <Smartphone class="w-7 h-7 shrink-0" />
            <p class="text-sm text-muted-foreground">
              {{ $t("pwa.install_dialog.android_step2") }}
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
