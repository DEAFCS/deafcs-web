<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Button } from "~/components/ui/button";
import { NEWS_COMMENT_MAX_LENGTH } from "~/composables/useNewsComments";

/** DEAFCS-only: the text box used to post, reply to and edit News comments. */
const props = withDefaults(
  defineProps<{
    initial?: string;
    placeholder?: string;
    submitLabel: string;
    busy?: boolean;
    autofocus?: boolean;
    cancellable?: boolean;
  }>(),
  { initial: "", placeholder: "", busy: false, autofocus: false, cancellable: true },
);

const emit = defineEmits<{ submit: [body: string]; cancel: [] }>();

const text = ref(props.initial);
const input = ref<HTMLTextAreaElement | null>(null);
const trimmed = computed(() => text.value.trim());
const remaining = computed(() => NEWS_COMMENT_MAX_LENGTH - text.value.length);
const canSubmit = computed(
  () => !props.busy && trimmed.value.length > 0 && remaining.value >= 0,
);

function submit() {
  if (!canSubmit.value) {
    return;
  }
  emit("submit", trimmed.value);
}

function onKeydown(event: KeyboardEvent) {
  // Ctrl/Cmd+Enter posts; Enter alone is a new line.
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submit();
  } else if (event.key === "Escape" && props.cancellable) {
    emit("cancel");
  }
}

function clear() {
  text.value = "";
}

onMounted(() => {
  if (props.autofocus) {
    input.value?.focus();
  }
});

defineExpose({ clear });
</script>

<template>
  <div class="grid gap-2">
    <textarea
      ref="input"
      v-model="text"
      rows="3"
      :maxlength="NEWS_COMMENT_MAX_LENGTH"
      :placeholder="placeholder"
      class="min-h-[4.5rem] w-full resize-y rounded-lg border border-border bg-background/60 px-3 py-2 text-[0.9375rem] leading-relaxed placeholder:text-muted-foreground/70 focus-visible:border-[hsl(var(--tac-amber)/0.6)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--tac-amber)/0.45)]"
      data-testid="comment-input"
      @keydown="onKeydown"
    />
    <div class="flex flex-wrap items-center justify-end gap-2">
      <span
        v-if="remaining < 200"
        class="mr-auto text-xs tabular-nums"
        :class="remaining < 0 ? 'text-destructive' : 'text-muted-foreground'"
      >
        {{ remaining }}
      </span>
      <Button
        v-if="cancellable"
        type="button"
        variant="ghost"
        size="sm"
        @click="emit('cancel')"
      >
        {{ $t("common.cancel") }}
      </Button>
      <Button
        type="button"
        size="sm"
        class="bg-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber-foreground))] hover:bg-[hsl(var(--tac-amber)/0.9)]"
        :disabled="!canSubmit"
        :loading="busy"
        data-testid="comment-submit"
        @click="submit"
      >
        {{ submitLabel }}
      </Button>
    </div>
  </div>
</template>
