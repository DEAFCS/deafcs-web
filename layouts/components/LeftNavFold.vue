<script setup lang="ts">
import type { Component } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useLeftNavFold } from "~/composables/useLeftNavFold";

// One section of the left nav: a heading that folds, with its pages indented
// under a line. Collapsed to icons (rail) there is no heading to fold, so the
// pages are a plain list.
const props = defineProps<{
  id: string;
  label: string;
  icon: Component;
  rail: boolean;
}>();

const { isOpen, setOpen } = useLeftNavFold();
</script>

<template>
  <SidebarGroup v-if="rail" class="py-1">
    <SidebarMenu><slot /></SidebarMenu>
  </SidebarGroup>

  <SidebarGroup v-else class="py-0.5">
    <button
      type="button"
      class="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-semibold text-sidebar-foreground/90 outline-none ring-sidebar-ring transition-colors hover:bg-white/[0.04] focus-visible:ring-2"
      :aria-expanded="isOpen(props.id)"
      @click="setOpen(props.id, !isOpen(props.id))"
    >
      <component :is="icon" class="size-[18px] shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-left">{{ label }}</span>
      <ChevronDown
        class="size-4 shrink-0 text-muted-foreground transition-transform duration-150"
        :class="isOpen(props.id) ? '' : '-rotate-90'"
      />
    </button>
    <div
      v-show="isOpen(props.id)"
      class="ml-[17px] border-l border-sidebar-border pl-3 [&_svg]:hidden [&_.he-grenade-mask]:hidden"
    >
      <SidebarMenu><slot /></SidebarMenu>
    </div>
  </SidebarGroup>
</template>
