<script setup lang="ts">
import { useBackToLink } from "~/composables/useInAppBack";

// DEAFCS: a "Back to ..." link that is a real Back when the page it names is
// the one the user just came from. A plain link would push that page again
// (list -> item -> list -> item ...), so the phone's Back and the top bar
// arrow would walk the same pages twice, and the list would open at the top
// instead of where the user left it. Otherwise (opened from elsewhere, a cold
// app launch, a new tab) it is an ordinary link to `to`.
defineOptions({ inheritAttrs: false });
const props = defineProps<{ to: string }>();
const backToLink = useBackToLink();
</script>

<template>
  <NuxtLink v-slot="{ href, navigate }" :to="props.to" custom>
    <a
      :href="href"
      v-bind="$attrs"
      @click="backToLink($event, props.to, navigate)"
    >
      <slot />
    </a>
  </NuxtLink>
</template>
