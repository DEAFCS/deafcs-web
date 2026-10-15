<script lang="ts" setup>
import {
  ref,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  computed,
} from "vue";
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";

type FilterOption = {
  key: string;
  label: string;
  title?: string;
  desc?: string;
  count?: number;
  disabled?: boolean;
  icon?: any;
};

const props = defineProps<{
  options: FilterOption[];
  square?: boolean;
  size?: "lg";
  block?: boolean;
  fill?: boolean;
  accentRgb?: string;
  // Upstream 5Stack (utility library). Count over label, in equal columns. For
  // narrow columns where a row of label-plus-count pills does not fit and
  // wrapping strands the last one.
  stacked?: boolean;
  // Upstream 5Stack (utility library). Icons only, with the selected tab
  // wearing its label. DEAFCS keeps its own indicator, so the pill slides with
  // the existing CSS transition rather than the upstream FLIP swap animation.
  collapse?: boolean;
}>();

const model = defineModel<string>();

const containerShape = computed(() =>
  props.square ? "rounded-md" : "rounded-full",
);
const indicatorShape = computed(() =>
  props.square ? "rounded" : "rounded-full",
);
const buttonShape = computed(() => {
  const base = props.collapse ? "" : props.block ? "flex-1" : "";
  if (props.stacked) {
    return "flex min-w-0 flex-col items-center justify-center gap-1 rounded-sm px-1 py-1.5";
  }
  if (props.size === "lg") {
    return `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2.5 font-mono text-[0.72rem] font-bold uppercase leading-tight tracking-[0.08em] ${base}`;
  }
  return props.square
    ? `inline-flex items-center justify-center gap-1.5 rounded px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${base}`
    : `inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs tracking-[0.06em] ${base}`;
});
function buttonMotion(opt: FilterOption) {
  if (!props.collapse) {
    return "transition-colors duration-200";
  }
  return [
    "transition-colors duration-200",
    model.value === opt.key ? "min-w-0 grow" : "shrink-0 grow-0",
  ];
}

function labelMotion(opt: FilterOption) {
  return model.value === opt.key ? "grid-cols-[1fr]" : "grid-cols-[0fr] opacity-0";
}

function countTone(opt: FilterOption) {
  if (model.value === opt.key || opt.disabled) {
    return "";
  }
  return (opt.count ?? 0) === 0 ? "opacity-35" : "";
}

function buttonState(opt: FilterOption) {
  const selected = model.value === opt.key;
  if (opt.disabled) {
    return selected
      ? "cursor-not-allowed font-bold text-black"
      : "cursor-not-allowed text-muted-foreground/40";
  }
  return selected
    ? "font-bold text-black"
    : "text-muted-foreground hover:text-foreground";
}

const containerRef = ref<HTMLElement | null>(null);
const btns = ref<Record<string, HTMLElement | null>>({});
const indicator = ref({ left: 0, top: 0, width: 0, height: 0, ready: false });
const animate = ref(false);

function setBtn(el: Element | null, key: string) {
  if (el) {
    btns.value[key] = el as HTMLElement;
  } else {
    delete btns.value[key];
  }
}

function updateIndicator() {
  const el = model.value ? btns.value[model.value] : null;
  if (!el || !containerRef.value || el.offsetWidth === 0) {
    indicator.value = { ...indicator.value, ready: false };
    animate.value = false;
    return;
  }
  const wasReady = indicator.value.ready;
  indicator.value = {
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
    ready: true,
  };
  if (!wasReady) {
    animate.value = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        animate.value = true;
      }),
    );
  }
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  nextTick(updateIndicator);
  if (typeof ResizeObserver !== "undefined" && containerRef.value) {
    ro = new ResizeObserver(() => updateIndicator());
    ro.observe(containerRef.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());

watch(
  () => [model.value, props.options.map((o) => o.key).join(",")],
  () => nextTick(updateIndicator),
);
</script>

<template>
  <div
    ref="containerRef"
    class="relative max-w-full gap-1 border border-border bg-muted/30 p-1"
    :class="[
      containerShape,
      fill ? 'flex-1 self-stretch' : 'self-start',
      stacked
        ? 'grid w-full auto-cols-fr grid-flow-col'
        : block
          ? 'flex w-full'
          : 'inline-flex w-fit flex-wrap',
    ]"
  >
    <span
      class="pointer-events-none absolute"
      :class="[
        indicatorShape,
        indicator.ready ? 'opacity-100' : 'opacity-0',
        animate ? 'transition-all duration-300 ease-out' : '',
        accentRgb
          ? 'border border-[rgb(var(--filter-accent-rgb)/0.8)] bg-[rgb(var(--filter-accent-rgb))] shadow-[0_0_12px_-2px_rgb(var(--filter-accent-rgb)/0.6)]'
          : 'bg-[hsl(var(--tac-amber))] shadow-[0_0_12px_-2px_hsl(var(--tac-amber)/0.6)]',
      ]"
      :style="{
        left: `${indicator.left}px`,
        top: `${indicator.top}px`,
        width: `${indicator.width}px`,
        height: `${indicator.height}px`,
        ...(accentRgb ? { '--filter-accent-rgb': accentRgb } : {}),
      }"
    />
    <template v-for="opt in options" :key="opt.key">
      <FiveStackToolTip
        v-if="opt.title || opt.desc"
        as-child
        side="top"
        :delay-duration="120"
        :tap-toggle="false"
      >
        <template #trigger>
          <button
            :ref="(el) => setBtn(el as Element | null, opt.key)"
            type="button"
            :disabled="opt.disabled"
            class="relative z-10"
            :class="[buttonShape, buttonState(opt), buttonMotion(opt)]"
            @click="!opt.disabled && (model = opt.key)"
          >
            <template v-if="stacked">
              <span
                class="text-[0.95rem] font-semibold leading-none tabular-nums tracking-tight"
                :class="countTone(opt)"
              >
                {{ opt.count ?? 0 }}
              </span>
              <span class="font-mono text-[0.5rem] uppercase leading-none tracking-[0.08em] opacity-80">
                {{ opt.label }}
              </span>
            </template>
            <template v-else>
              <component :is="opt.icon" v-if="opt.icon" class="h-4 w-4" />
              <span
                v-if="opt.label && collapse"
                class="grid"
                :class="labelMotion(opt)"
              >
                <span class="min-w-0 overflow-hidden">
                  <span class="af-label block whitespace-nowrap pl-1.5 font-bold">{{ opt.label }}</span>
                </span>
              </span>
              <template v-else>{{ opt.label }}</template>
              <span v-if="opt.count !== undefined" class="ml-1 opacity-60">{{
                opt.count
              }}</span>
            </template>
          </button>
        </template>
        <div class="max-w-[220px] space-y-0.5">
          <div
            v-if="opt.title"
            class="font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-foreground"
          >
            {{ opt.title }}
          </div>
          <div
            v-if="opt.desc"
            class="text-xs leading-snug text-muted-foreground"
          >
            {{ opt.desc }}
          </div>
        </div>
      </FiveStackToolTip>
      <button
        v-else
        :ref="(el) => setBtn(el as Element | null, opt.key)"
        type="button"
        :disabled="opt.disabled"
        class="relative z-10"
        :class="[buttonShape, buttonState(opt), buttonMotion(opt)]"
        @click="!opt.disabled && (model = opt.key)"
      >
        <template v-if="stacked">
          <span
            class="text-[0.95rem] font-semibold leading-none tabular-nums tracking-tight"
            :class="countTone(opt)"
          >
            {{ opt.count ?? 0 }}
          </span>
          <span class="font-mono text-[0.5rem] uppercase leading-none tracking-[0.08em] opacity-80">
            {{ opt.label }}
          </span>
        </template>
        <template v-else>
          <component :is="opt.icon" v-if="opt.icon" class="h-4 w-4" />
          <span
            v-if="opt.label && collapse"
            class="grid"
            :class="labelMotion(opt)"
          >
            <span class="min-w-0 overflow-hidden">
              <span class="af-label block whitespace-nowrap pl-1.5 font-bold">{{ opt.label }}</span>
            </span>
          </span>
          <template v-else>{{ opt.label }}</template>
          <span v-if="opt.count !== undefined" class="ml-1 opacity-60">{{
            opt.count
          }}</span>
        </template>
      </button>
    </template>
  </div>
</template>
