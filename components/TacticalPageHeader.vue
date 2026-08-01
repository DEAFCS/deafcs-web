<script setup lang="ts">
import {
  tacticalTabIndicatorClasses,
  tacticalTabIndicatorFinishedClasses,
  tacticalTabIndicatorLiveClasses,
  tacticalTabIndicatorUpcomingClasses,
  tacticalTabsListClasses,
  tacticalTabsTriggerClasses,
  tacticalWordmarkForegroundClasses,
  tacticalWordmarkOffsetClasses,
  tacticalWordmarkPageTitleClasses,
} from "~/utilities/tacticalClasses";

defineProps<{
  corners?: "both" | "tl" | "br" | "none";
  inlineActions?: boolean;
  stackActions?: boolean;
}>();

const tacticalTabs = {
  listClass: tacticalTabsListClasses,
  triggerClass: tacticalTabsTriggerClasses,
  indicatorClass: tacticalTabIndicatorClasses,
  indicatorLiveClass: tacticalTabIndicatorLiveClasses,
  indicatorUpcomingClass: tacticalTabIndicatorUpcomingClasses,
  indicatorFinishedClass: tacticalTabIndicatorFinishedClasses,
};
</script>

<template>
  <header
    class="relative overflow-hidden rounded-lg border border-border bg-[linear-gradient(180deg,hsl(var(--card)/0.55)_0%,hsl(var(--card)/0.25)_100%)] px-4 py-4 sm:px-6 sm:py-5 [backdrop-filter:blur(6px)]"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none absolute left-2 top-2 h-[14px] w-[14px] border-l-2 border-t-2 border-[hsl(var(--tac-amber))]"
    ></span>
    <span
      aria-hidden="true"
      class="pointer-events-none absolute bottom-2 right-2 h-[14px] w-[14px] border-b-2 border-r-2 border-[hsl(var(--tac-amber))]"
    ></span>

    <div
      class="flex gap-3"
      :class="
        inlineActions
          ? 'flex-row items-center justify-between'
          : stackActions
            ? 'flex-col'
            : 'flex-col sm:flex-row sm:items-end sm:justify-between sm:gap-6'
      "
    >
      <div class="flex min-w-0 flex-col gap-[0.35rem]">
        <span
          v-if="$slots.description"
          class="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground"
        >
          <span
            class="translate-y-[-1px] text-[0.7rem] text-[hsl(var(--tac-amber))]"
            >◢</span
          >
          <slot name="description"></slot>
        </span>

        <h1
          :class="tacticalWordmarkPageTitleClasses"
        >
          <span
            aria-hidden="true"
            :class="tacticalWordmarkOffsetClasses"
          >
            <slot name="title"></slot>
          </span>
          <span
            :class="tacticalWordmarkForegroundClasses"
          >
            <slot name="title"></slot>
          </span>
        </h1>

        <p
          v-if="$slots.subtitle"
          class="m-0 max-w-2xl text-sm text-muted-foreground"
        >
          <slot name="subtitle"></slot>
        </p>
      </div>

      <div
        v-if="$slots.actions"
        class="flex items-center gap-3"
        :class="
          inlineActions
            ? 'ml-auto shrink-0'
            : stackActions
              ? '-mx-1 overflow-x-auto px-1 pb-1 [&>*]:shrink-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'sm:ml-auto sm:shrink-0 max-sm:-mx-1 max-sm:overflow-x-auto max-sm:px-1 max-sm:pb-1 max-sm:[&>*]:shrink-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        "
      >
        <slot name="actions" :tabs="tacticalTabs"></slot>
      </div>
    </div>
  </header>
</template>
