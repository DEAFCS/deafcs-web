<script setup lang="ts">
import { Play, ChevronDown, X, Check } from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { useQuickQueue } from "~/composables/useQuickQueue";
import { setActiveHub } from "~/composables/useHubState";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { modeColorStyle, modeFormat } from "~/utilities/matchmakingModes";

// The header's Play control (5Stack's QuickPlayButton). One click queues the
// mode you played last; the arrow picks another. While a search runs it
// becomes the search clock, so the queue is visible from every page. Clicking
// the clock opens the party room in the hub; the cross cancels.
//
// DEAFCS: the four DEAFCS modes, each with its own color as a dot beside the
// name (the name and the check mark say which one is picked, not the color
// alone). Queueing goes through useQuickQueue's join, the same one /play uses.
const props = defineProps<{ leader: boolean }>();

const {
  modes,
  quickMode,
  queue,
  queueMode,
  clock,
  modeTitle,
  modeLabel,
  requirementText,
  join,
  leave,
} = useQuickQueue();

function openPartyRoom() {
  setActiveHub("lobby");
  useRightSidebar().setRightSidebarOpen(true);
}

const ctaFill =
  "border border-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber-foreground))] [background:linear-gradient(135deg,var(--tac-amber-cta-from)_0%,hsl(var(--tac-amber))_50%,var(--tac-amber-cta-to)_100%)]";
const modeDot =
  "size-2 shrink-0 rounded-full bg-[rgb(var(--mode-rgb))] shadow-[0_0_0_1.5px_rgb(0_0_0/0.35)]";
</script>

<template>
  <div
    v-if="queue"
    data-quick-play="searching"
    class="inline-flex h-8 items-center overflow-hidden rounded-md border border-[rgb(var(--mode-rgb)/0.55)] bg-[rgb(var(--mode-rgb)/0.1)] text-[rgb(var(--mode-rgb))]"
    :style="modeColorStyle(queueMode ?? queue)"
  >
    <button
      type="button"
      class="inline-flex h-full items-center gap-2 pl-2.5 pr-2.5 text-xs font-semibold tabular-nums transition-colors hover:bg-[rgb(var(--mode-rgb)/0.12)]"
      :aria-label="
        $t('layouts.queue.searching', {
          mode: modeLabel(queueMode ?? queue),
          time: clock ?? '',
        })
      "
      @click="openPartyRoom"
    >
      <span class="relative flex size-1.5" aria-hidden="true">
        <span
          class="absolute inline-flex size-full animate-ping rounded-full bg-[rgb(var(--mode-rgb))] opacity-75 motion-reduce:animate-none"
        />
        <span
          class="relative inline-flex size-1.5 rounded-full bg-[rgb(var(--mode-rgb))]"
        />
      </span>
      <span v-if="clock">{{ clock }}</span>
      <span class="font-medium text-foreground/80 max-xl:hidden">
        {{ modeTitle(queueMode ?? queue) }}
      </span>
    </button>
    <button
      v-if="props.leader"
      type="button"
      class="grid h-full w-7 place-items-center border-l border-[rgb(var(--mode-rgb)/0.3)] transition-colors hover:bg-[rgb(var(--mode-rgb)/0.15)]"
      :aria-label="$t('layouts.queue.cancel')"
      @click="leave"
    >
      <X class="size-3.5" />
    </button>
  </div>

  <div
    v-else-if="props.leader && quickMode"
    data-quick-play="idle"
    class="inline-flex h-8 rounded-md shadow-[0_0_0_1px_hsl(var(--tac-amber)/0.35),0_4px_14px_-4px_hsl(var(--tac-amber)/0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_0_0_1px_hsl(var(--tac-amber)/0.55),0_8px_22px_-4px_hsl(var(--tac-amber)/0.7)]"
  >
    <button
      type="button"
      class="inline-flex h-8 items-center gap-1.5 rounded-l-md px-3 text-xs font-semibold"
      :class="ctaFill"
      :aria-label="
        $t('layouts.queue.find', { mode: modeLabel(quickMode) })
      "
      @click="join(quickMode)"
    >
      <Play class="size-3.5 fill-current" />
      <span :class="modeDot" :style="modeColorStyle(quickMode)" />
      <!-- Short labels until the top bar has room: Captain Pick keeps its
           name, the rest read 5v5 / 2v2 / 1v1. -->
      <span
        :class="quickMode.variant === 'CaptainPick' ? '' : 'max-xl:hidden'"
        >{{ modeTitle(quickMode) }}</span
      >
      <span
        :class="quickMode.variant === 'CaptainPick' ? 'max-xl:hidden' : ''"
        >{{ modeFormat(quickMode) }}</span
      >
    </button>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="grid h-8 w-7 place-items-center rounded-r-md border-l-black/25"
          :class="ctaFill"
          :aria-label="$t('layouts.queue.pick_mode')"
        >
          <ChevronDown class="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-64">
        <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">
          {{ $t("layouts.queue.pick_mode") }}
        </DropdownMenuLabel>
        <DropdownMenuItem
          v-for="mode in modes"
          :key="mode.key"
          :data-mode-key="mode.key"
          :disabled="!mode.canQueue"
          :style="modeColorStyle(mode)"
          class="border-l-2 border-transparent data-[picked=true]:border-[rgb(var(--mode-rgb))] data-[picked=true]:bg-[rgb(var(--mode-rgb)/0.08)]"
          :data-picked="quickMode.key === mode.key"
          @select="join(mode)"
        >
          <span :class="modeDot" aria-hidden="true" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm">
              {{ modeTitle(mode) }}
              <span class="text-muted-foreground">{{ modeFormat(mode) }}</span>
            </span>
            <span class="text-[0.7rem] text-muted-foreground">
              {{
                mode.canQueue
                  ? $t("layouts.queue.in_queue", { count: mode.inQueue })
                  : requirementText(mode)
              }}
            </span>
          </div>
          <Check
            v-if="quickMode.key === mode.key"
            class="text-[rgb(var(--mode-rgb))]"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="navigateTo('/play')">
          {{ $t("layouts.queue.all_modes") }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

  <NuxtLink
    v-else-if="props.leader"
    to="/play"
    :title="$t('layouts.lobby_panel.find_match')"
    class="inline-flex h-8 w-8 items-center justify-center rounded-md"
    :class="ctaFill"
  >
    <Play class="size-4 fill-current" />
  </NuxtLink>
</template>
