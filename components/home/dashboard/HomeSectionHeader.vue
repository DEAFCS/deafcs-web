<script setup lang="ts">
import { ArrowRight, FlaskConical } from "lucide-vue-next";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";
import { SAMPLE_BADGE_TEXT } from "~/components/home/dashboard/homeDashboard";

// Section title row of the signed-in dashboard: the /play section label
// (amber tick + small caps), an optional "See all" link, and a visible
// badge whenever the section shows local preview samples instead of data.
// `linkBesideTitle` puts the link right after the title (as on /watch's
// Highlights), leaving the far right to the actions slot (e.g. arrows).
defineProps<{
  id: string;
  title: string;
  to?: string;
  linkLabel?: string;
  linkBesideTitle?: boolean;
  sample?: boolean;
}>();

const linkClasses =
  "inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground";
</script>

<template>
  <div class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <h2 :id="id" :class="[tacticalSectionLabelClasses, '!mb-0']">
        <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
        {{ title }}
      </h2>
      <NuxtLink v-if="to && linkBesideTitle" :to="to" :class="linkClasses">
        {{ linkLabel || $t("common.see_all") }}
        <ArrowRight class="size-3" aria-hidden="true" />
      </NuxtLink>
    </div>
    <div class="flex min-w-0 items-center gap-3">
      <span
        v-if="sample"
        class="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-sky-300"
        data-testid="home-sample-badge"
      >
        <FlaskConical class="size-3" aria-hidden="true" />
        {{ SAMPLE_BADGE_TEXT }}
      </span>
      <slot name="actions" />
      <NuxtLink v-if="to && !linkBesideTitle" :to="to" :class="linkClasses">
        {{ linkLabel || $t("common.see_all") }}
        <ArrowRight class="size-3" aria-hidden="true" />
      </NuxtLink>
    </div>
  </div>
</template>
