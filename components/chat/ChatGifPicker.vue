<script setup lang="ts">
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Sticker, Loader2 } from "lucide-vue-next";
import { searchGifs, type GifSearchResult } from "~/utilities/searchGifs";

const emit = defineEmits<{
  (e: "pick", gifUrl: string): void;
}>();

const open = ref(false);
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

watch(open, (isOpen) => {
  if (isOpen && results.value.length === 0) {
    runSearch("");
  }
});

function pick(gif: GifSearchResult) {
  emit("pick", gif.sendUrl);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" size="icon" class="shrink-0">
        <Sticker class="h-4 w-4" />
        <span class="sr-only">{{ $t("chat.attach_gif", "Attach a GIF") }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-80 p-2" align="start" side="top">
      <Input
        v-model="query"
        :placeholder="$t('chat.search_gifs', 'Search GIFs...')"
        class="mb-2"
        autocomplete="off"
        @input="onQueryInput"
      />
      <div class="h-64 overflow-y-auto">
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
            @click="pick(gif)"
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
</template>
