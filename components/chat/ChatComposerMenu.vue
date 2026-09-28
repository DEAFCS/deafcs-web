<script setup lang="ts">
import { ChevronLeft, ImageUp, Loader2, Plus } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { searchGifs, type GifSearchResult } from "~/utilities/searchGifs";
import GifIcon from "~/components/chat/icons/GifIcon.vue";

const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

// Empty draft: attach-file and GIF get their own icon buttons, side by
// side, next to the text field (Messenger's layout with something
// typed). Once there's a draft, those two collapse into a single "+"
// that opens the same two choices in a small menu instead -- reported:
// two separate icon buttons sitting there permanently felt cramped and
// amateurish next to the text field.
const props = defineProps<{
  hasDraft: boolean;
}>();

const emit = defineEmits<{
  (e: "pick-file", file: File): void;
  (e: "pick-gif", gifUrl: string): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function pickFile() {
  fileInputRef.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    toast({
      variant: "destructive",
      title: "Unsupported file type",
      description: "Attach an image (PNG/JPEG/WEBP/GIF) or a video (MP4/WEBM/MOV).",
    });
    return;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    toast({
      variant: "destructive",
      title: "File too large",
      description: "Attachments are limited to 200 MB.",
    });
    return;
  }
  emit("pick-file", file);
}

// Shared GIF-search state -- both the standalone GIF button (empty
// draft) and the "+" menu's "Choose a GIF" step (typed draft) open the
// same search view, just from two different popovers.
const query = ref("");
const results = ref<GifSearchResult[]>([]);
const loading = ref(false);
let searchToken = 0;

async function runSearch(q: string) {
  const token = ++searchToken;
  loading.value = true;
  try {
    const found = await searchGifs(q);
    if (token !== searchToken) return;
    results.value = found;
  } catch {
    if (token !== searchToken) return;
    results.value = [];
  } finally {
    if (token === searchToken) loading.value = false;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
function onQueryInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runSearch(query.value), 300);
}

function ensureResultsLoaded() {
  if (results.value.length === 0) runSearch("");
}

const gifOpen = ref(false);
const menuOpen = ref(false);
const menuView = ref<"menu" | "gif">("menu");

watch(gifOpen, (isOpen) => {
  if (isOpen) ensureResultsLoaded();
});
watch(menuOpen, (isOpen) => {
  if (isOpen) menuView.value = "menu";
});

function openGifFromMenu() {
  menuView.value = "gif";
  ensureResultsLoaded();
}

function pickGif(gif: GifSearchResult) {
  emit("pick-gif", gif.sendUrl);
  gifOpen.value = false;
  menuOpen.value = false;
}
</script>

<template>
  <div class="relative shrink-0">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
      class="hidden"
      @change="onFileChange"
    />

    <Transition name="composer-icons">
      <div v-if="!props.hasDraft" key="expanded" class="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          class="shrink-0 rounded-full"
          @click="pickFile"
        >
          <ImageUp class="h-4 w-4" />
          <span class="sr-only">{{ $t("chat.attach_file_menu", "Attach a file (up to 200 MB)") }}</span>
        </Button>
        <Popover v-model:open="gifOpen">
          <PopoverTrigger as-child>
            <Button type="button" variant="outline" size="icon-sm" class="shrink-0 rounded-full">
              <GifIcon class="h-4 w-4" />
              <span class="sr-only">{{ $t("chat.choose_gif_menu", "Choose a GIF") }}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-72 p-2" align="start" side="top">
            <Input
              v-model="query"
              :placeholder="$t('chat.search_gifs', 'Search GIFs...')"
              class="mb-2 h-8"
              autocomplete="off"
              @input="onQueryInput"
            />
            <div class="h-56 overflow-y-auto">
              <div v-if="loading" class="flex h-full items-center justify-center">
                <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <div
                v-else-if="results.length === 0"
                class="flex h-full items-center justify-center text-xs text-muted-foreground"
              >
                {{ $t("chat.no_gifs_found", "No GIFs found") }}
              </div>
              <div v-else class="grid grid-cols-2 gap-1.5">
                <button
                  v-for="gif in results"
                  :key="gif.id"
                  type="button"
                  class="overflow-hidden rounded-md border border-border/60 hover:opacity-80"
                  @click="pickGif(gif)"
                >
                  <img :src="gif.previewUrl" class="h-full w-full object-cover" alt="" />
                </button>
              </div>
            </div>
            <!-- Required by GIPHY's API terms wherever GIF search/results are shown. -->
            <p class="mt-1.5 text-center text-[9px] uppercase tracking-wide text-muted-foreground">
              {{ $t("chat.powered_by_giphy", "Powered by GIPHY") }}
            </p>
          </PopoverContent>
        </Popover>
      </div>

      <div v-else key="collapsed" class="flex items-center">
        <Popover v-model:open="menuOpen">
          <PopoverTrigger as-child>
            <Button type="button" variant="outline" size="icon-sm" class="shrink-0 rounded-full">
              <Plus class="h-4 w-4" />
              <span class="sr-only">{{ $t("chat.add_to_message", "Add to your message") }}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-72 p-2" align="start" side="top">
            <template v-if="menuView === 'menu'">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                @click="pickFile(); menuOpen = false"
              >
                <ImageUp class="h-4 w-4 shrink-0 text-muted-foreground" />
                {{ $t("chat.attach_file_menu", "Attach a file (up to 200 MB)") }}
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                @click="openGifFromMenu"
              >
                <GifIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
                {{ $t("chat.choose_gif_menu", "Choose a GIF") }}
              </button>
            </template>
            <template v-else>
              <div class="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                  @click="menuView = 'menu'"
                >
                  <ChevronLeft class="h-4 w-4" />
                </button>
                <Input
                  v-model="query"
                  :placeholder="$t('chat.search_gifs', 'Search GIFs...')"
                  class="h-8 flex-1"
                  autocomplete="off"
                  @input="onQueryInput"
                />
              </div>
              <div class="h-56 overflow-y-auto">
                <div v-if="loading" class="flex h-full items-center justify-center">
                  <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
                <div
                  v-else-if="results.length === 0"
                  class="flex h-full items-center justify-center text-xs text-muted-foreground"
                >
                  {{ $t("chat.no_gifs_found", "No GIFs found") }}
                </div>
                <div v-else class="grid grid-cols-2 gap-1.5">
                  <button
                    v-for="gif in results"
                    :key="gif.id"
                    type="button"
                    class="overflow-hidden rounded-md border border-border/60 hover:opacity-80"
                    @click="pickGif(gif)"
                  >
                    <img :src="gif.previewUrl" class="h-full w-full object-cover" alt="" />
                  </button>
                </div>
              </div>
              <p class="mt-1.5 text-center text-[9px] uppercase tracking-wide text-muted-foreground">
                {{ $t("chat.powered_by_giphy", "Powered by GIPHY") }}
              </p>
            </template>
          </PopoverContent>
        </Popover>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Quick collapse/expand when the draft goes from empty to non-empty (or
   back) -- matches the snappy (~150ms) crossfade+scale seen in the
   Messenger reference, rather than a slow deliberate animation. */
.composer-icons-enter-active,
.composer-icons-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.composer-icons-enter-from,
.composer-icons-leave-to {
  opacity: 0;
  transform: scale(0.7);
}
</style>
