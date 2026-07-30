<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const scrollEl = ref<HTMLElement | null>(null)
const showTopFade = ref(false)
const showBottomFade = ref(false)

let resizeObserver: ResizeObserver | undefined
let mutationObserver: MutationObserver | undefined

function updateFades() {
  const element = scrollEl.value
  if (!element) return

  const maxScrollTop = element.scrollHeight - element.clientHeight
  showTopFade.value = element.scrollTop > 1
  showBottomFade.value = maxScrollTop - element.scrollTop > 1
}

onMounted(async () => {
  await nextTick()
  updateFades()

  if (!scrollEl.value) return

  resizeObserver = new ResizeObserver(updateFades)
  resizeObserver.observe(scrollEl.value)

  mutationObserver = new MutationObserver(updateFades)
  mutationObserver.observe(scrollEl.value, {
    childList: true,
    subtree: true,
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
})
</script>

<template>
  <div class="relative flex min-h-0 flex-1">
    <div
      ref="scrollEl"
      data-sidebar="content"
      :class="
        cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto',
          props.class,
        )
      "
      @scroll="updateFades"
    >
      <slot />
    </div>
    <div
      v-if="showTopFade"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-sidebar to-transparent"
    />
    <div
      v-if="showBottomFade"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-sidebar to-transparent"
    />
  </div>
</template>
