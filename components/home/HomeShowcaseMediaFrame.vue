<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  mediaType: "image" | "video" | "placeholder";
  mediaSrc?: string;
  mediaPoster?: string;
  icon: Component;
  title: string;
}>();
</script>

<template>
  <div
    class="relative aspect-video w-full overflow-hidden rounded-xl border border-[hsl(var(--tac-amber)/0.4)] bg-[linear-gradient(160deg,hsl(var(--card)/0.9)_0%,hsl(var(--background))_65%,hsl(var(--tac-amber)/0.06)_100%)] shadow-[0_0_0_1px_hsl(var(--tac-amber)/0.25),0_0_44px_-8px_hsl(var(--tac-amber)/0.4)]"
  >
    <span
      class="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-[hsl(var(--tac-amber)/0.6)]"
      aria-hidden="true"
    ></span>
    <span
      class="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-[hsl(var(--tac-amber)/0.6)]"
      aria-hidden="true"
    ></span>

    <video
      v-if="mediaType === 'video' && mediaSrc"
      :key="mediaSrc"
      class="h-full w-full object-cover"
      autoplay
      muted
      loop
      playsinline
      :poster="mediaPoster"
      :src="mediaSrc"
    ></video>

    <NuxtImg
      v-else-if="mediaType === 'image' && mediaSrc"
      :key="mediaSrc"
      :src="mediaSrc"
      :alt="title"
      class="h-full w-full object-cover"
    />

    <div
      v-else
      class="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center"
    >
      <component
        :is="icon"
        class="h-9 w-9 text-[hsl(var(--tac-amber)/0.65)]"
        aria-hidden="true"
      />
      <p
        class="font-mono text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {{ title }}
      </p>
      <p class="text-xs text-muted-foreground/70">Preview coming soon</p>
    </div>
  </div>
</template>
