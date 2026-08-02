<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

interface Props {
  delay?: number
  show?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  delay: 0,
  show: true
})

const clientMounted = ref(false)
const reducedMotion = ref(false)

onMounted(() => {
  clientMounted.value = true
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches
})

const visible = computed(() => props.show && (import.meta.server || clientMounted.value))

function setEnterDelay(el: Element) {
  if (!props.delay || reducedMotion.value) {
    return
  }

  ;(el as HTMLElement).style.transitionDelay = `${props.delay}ms`
}

function clearEnterDelay(el: Element) {
  ;(el as HTMLElement).style.transitionDelay = ""
}
</script>

<template>
  <Transition
    appear
    enter-active-class="transition-[opacity,transform] [transition-duration:520ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,transform] motion-reduce:![transition-duration:1ms] motion-reduce:![transition-delay:0ms]"
    leave-active-class="transition-[opacity,transform] [transition-duration:520ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,transform] motion-reduce:![transition-duration:1ms] motion-reduce:![transition-delay:0ms]"
    enter-from-class="opacity-0 translate-y-5 motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
    leave-to-class="opacity-0 -translate-y-5 motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
    @before-enter="setEnterDelay"
    @after-enter="clearEnterDelay"
    @enter-cancelled="clearEnterDelay"
  >
    <div v-show="visible">
      <slot />
    </div>
  </Transition>
</template>
