<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import TwitchIcon from "~/components/icons/TwitchIcon.vue";
import { normalizeTwitchChannel, twitchChannelUrl } from "~/utilities/twitchChannel";
import {
  fetchMyTwitchChannel,
  fetchPlayerTwitch,
  saveMyTwitchChannel,
  type PlayerTwitch,
} from "~/composables/useTwitchApi";

// Linked Accounts > Streaming & Social: the player's own Twitch channel name.
// Not OAuth: the player only tells us which channel is theirs, so the card
// says "Configured", never "Connected". Saved through the API, which
// normalizes again and is the authority.
const props = defineProps<{
  steamId: string | number | null | undefined;
}>();

const { t } = useI18n();

const loaded = ref(false);
// The saved (normalized) channel, or null when none is set.
const saved = ref<string | null>(null);
const input = ref("");
const saving = ref(false);
const invalid = ref(false);
const status = ref<PlayerTwitch | null>(null);

// "configured" also covers "status unknown" (no Twitch credentials on the
// API yet): a saved channel is never shown as an error.
const state = computed<"not_configured" | "configured" | "offline" | "live">(() => {
  if (!saved.value) return "not_configured";
  if (status.value?.channel === saved.value) {
    if (status.value.live) return "live";
    if (status.value.checkedAt) return "offline";
  }
  return "configured";
});

const normalized = computed(() => normalizeTwitchChannel(input.value));
const unchanged = computed(
  () => normalized.value.ok && normalized.value.channel === saved.value,
);

async function loadStatus() {
  status.value = null;
  if (!saved.value || !props.steamId) return;
  status.value = await fetchPlayerTwitch(props.steamId);
}

async function load() {
  saved.value = await fetchMyTwitchChannel();
  input.value = saved.value ?? "";
  loaded.value = true;
  await loadStatus();
}

onMounted(load);
watch(
  () => props.steamId,
  (now, before) => {
    if (now && now !== before) load();
  },
);
watch(input, () => {
  invalid.value = false;
});

async function save(channel: string | null) {
  if (saving.value) return;
  saving.value = true;
  try {
    const result = await saveMyTwitchChannel(channel);
    if (!result.ok) {
      if (["invalid_channel", "invalid_url", "unsupported_url"].includes(result.error)) {
        invalid.value = true;
      }
      toast({
        variant: "destructive",
        title: t("pages.settings.linked_accounts.twitch.save_failed"),
      });
      return;
    }
    saved.value = result.channel;
    input.value = result.channel ?? "";
    toast({
      title: result.channel
        ? t("pages.settings.linked_accounts.twitch.saved")
        : t("pages.settings.linked_accounts.twitch.removed"),
    });
    await loadStatus();
  } finally {
    saving.value = false;
  }
}

function submit() {
  if (!normalized.value.ok) {
    invalid.value = true;
    return;
  }
  if (unchanged.value) return;
  save(normalized.value.channel);
}
</script>

<template>
  <div
    class="rounded-lg border border-border bg-card/50 overflow-hidden"
    data-testid="twitch-channel-card"
    :data-state="loaded ? state : 'loading'"
  >
    <div
      class="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <span
          class="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
          :class="
            state === 'live'
              ? 'bg-emerald-500/15 text-emerald-400'
              : saved
                ? 'bg-[hsl(var(--tac-amber)/0.15)] text-[hsl(var(--tac-amber))]'
                : 'bg-muted/60 text-muted-foreground'
          "
        >
          <TwitchIcon class="w-4 h-4 fill-current" />
        </span>
        <div class="min-w-0">
          <div class="text-sm font-medium leading-tight">
            {{ $t("pages.settings.linked_accounts.twitch.title") }}
          </div>
          <div
            v-if="loaded"
            class="flex flex-wrap items-center gap-x-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em]"
            data-testid="twitch-channel-status"
          >
            <template v-if="state === 'live'">
              <span
                class="size-2 rounded-full bg-emerald-500"
                data-testid="twitch-channel-live-dot"
                aria-hidden="true"
              ></span>
              <span class="text-emerald-400">{{
                $t("pages.settings.linked_accounts.twitch.status_live")
              }}</span>
            </template>
            <template v-else-if="saved">
              <span class="text-[hsl(var(--tac-amber))]">{{
                $t("pages.settings.linked_accounts.twitch.status_configured")
              }}</span>
              <span
                v-if="state === 'offline'"
                class="text-muted-foreground"
                data-testid="twitch-channel-offline"
                >· {{ $t("pages.settings.linked_accounts.twitch.status_offline") }}</span
              >
            </template>
            <span v-else class="text-muted-foreground">{{
              $t("pages.settings.linked_accounts.twitch.status_not_configured")
            }}</span>
          </div>
        </div>
      </div>

      <a
        v-if="saved"
        :href="twitchChannelUrl(saved)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        data-testid="twitch-channel-open"
      >
        {{ $t("pages.settings.linked_accounts.twitch.open_channel") }}
        <ExternalLink class="w-3 h-3" />
      </a>
    </div>

    <form class="grid gap-2 px-4 py-3" @submit.prevent="submit">
      <div class="flex flex-col gap-2 sm:flex-row">
        <div
          class="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-md border bg-background text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
          :class="invalid ? 'border-destructive' : 'border-input'"
        >
          <span
            class="flex h-full shrink-0 items-center border-r border-input bg-muted/40 px-3 text-muted-foreground"
            aria-hidden="true"
          >
            twitch.tv/
          </span>
          <input
            v-model="input"
            type="text"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-testid="twitch-channel-input"
            class="h-full min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground"
            :disabled="!loaded || saving"
            :placeholder="$t('pages.settings.linked_accounts.twitch.placeholder')"
            :aria-label="$t('pages.settings.linked_accounts.twitch.title')"
            :aria-invalid="invalid ? 'true' : undefined"
          />
        </div>
        <div class="flex shrink-0 gap-2">
          <Button
            type="submit"
            size="sm"
            class="h-9 flex-1 sm:flex-none"
            data-testid="twitch-channel-save"
            :disabled="!loaded || saving || unchanged"
          >
            {{ $t("pages.settings.linked_accounts.twitch.save") }}
          </Button>
          <Button
            v-if="saved"
            type="button"
            size="sm"
            variant="ghost"
            class="h-9 flex-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 sm:flex-none"
            data-testid="twitch-channel-remove"
            :disabled="saving"
            @click="save(null)"
          >
            {{ $t("pages.settings.linked_accounts.twitch.remove") }}
          </Button>
        </div>
      </div>
      <p
        v-if="invalid"
        class="text-xs text-destructive"
        data-testid="twitch-channel-invalid"
      >
        {{ $t("pages.settings.linked_accounts.twitch.invalid") }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ $t("pages.settings.linked_accounts.twitch.help") }}
      </p>
    </form>
    <div
      class="flex min-w-0 flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      data-testid="twitch-widget-help"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium">
          {{ $t("pages.settings.linked_accounts.twitch.widget_title") }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ $t("pages.settings.linked_accounts.twitch.widget_description") }}
        </p>
      </div>
      <a
        href="https://deafcs-widget.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex shrink-0 items-center gap-1 self-start rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
        data-testid="twitch-widget-open"
      >
        {{ $t("pages.settings.linked_accounts.twitch.widget_open") }}
        <ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
      </a>
    </div>
  </div>
</template>
