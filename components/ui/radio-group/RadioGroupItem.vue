<script setup lang="ts">
import type { RadioGroupItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { CheckIcon } from '@radix-icons/vue'
import {
  RadioGroupIndicator,
  RadioGroupItem,
  useForwardProps,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<RadioGroupItemProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <RadioGroupItem
    v-bind="forwardedProps"
    :class="
      cn(
        'peer aspect-square h-4 w-4 rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <!-- Default fallback preserves every existing caller's plain
         circle+checkmark indicator. A page that needs a differently-styled
         radio (e.g. a compact selectable pill) can pass its own slot
         content instead -- still a real role="radio" element underneath,
         just with custom appearance driven by data-[state=checked]. -->
    <slot>
      <RadioGroupIndicator class="flex items-center justify-center">
        <CheckIcon class="h-3.5 w-3.5 text-primary" />
      </RadioGroupIndicator>
    </slot>
  </RadioGroupItem>
</template>
