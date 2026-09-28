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

// Single "+" trigger instead of one icon button per action (attach, GIF)
// crowding the text field. Opens straight to the action list; picking
// "Choose a GIF" swaps the same popover's content to the search view
// rather than stacking a second popover. (Tried a Messenger-style
// two-state toggle -- separate icons when the draft is empty, collapsing
// to "+" once typing starts -- but it wasn't wanted; always just "+".)
const emit = defineEmits<{
  (e: "pick-file", file: File): void;
  (e: "pick-gif", gifUrl: string): void;
}>();

const open = ref(false);
const view = ref<"menu" | "gif">("menu");
const fileInputRef = ref<HTMLInputElement | null>(null);

watch(open, (isOpen) => {
  if (isOpen) view.value = "menu";
});

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
  open.value = false;
}

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

function openGifView() {
  view.value = "gif";
  if (results.value.length === 0) runSearch("");
}

function pickGif(gif: GifSearchResult) {
  emit("pick-gif", gif.sendUrl);
  open.value = false;
}
</script>

<template>
  <div>
    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
      class="hidden"
      @change="onFileChange"
    />
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button type="button" variant="outline" size="icon-sm" class="shrink-0 rounded-full">
          <Plus class="h-4 w-4" />
          <span class="sr-only">{{ $t("chat.add_to_message", "Add to your message") }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-72 p-2" align="start" side="top">
        <template v-if="view === 'menu'">
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            @click="pickFile"
          >
            <ImageUp class="h-4 w-4 shrink-0 text-muted-foreground" />
            {{ $t("chat.attach_file_menu", "Attach a file (up to 200 MB)") }}
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            @click="openGifView"
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
              @click="view = 'menu'"
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
          <!-- Required by GIPHY's API terms wherever GIF search/results are shown. -->
          <p class="mt-1.5 text-center text-[9px] uppercase tracking-wide text-muted-foreground">
            {{ $t("chat.powered_by_giphy", "Powered by GIPHY") }}
          </p>
        </template>
      </PopoverContent>
    </Popover>
  </div>
</template>
