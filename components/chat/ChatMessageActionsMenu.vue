<script setup lang="ts">
import { ref } from "vue";
import { Ellipsis, Pencil, Trash2, MessageSquareOff } from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

defineProps<{
  canEdit: boolean;
  // Extra classes let each message position its own trigger while this
  // component remains the single implementation of the action menu.
  triggerClass?: string;
  align?: "start" | "end";
}>();
const emit = defineEmits<{
  (e: "edit"): void;
  (e: "mute"): void;
  (e: "delete"): void;
}>();

// Tracked so the trigger stays visible (not just hover-revealed) for as
// long as the menu itself is open, even if the pointer moves away from the
// trigger and this row's hover state is lost.
const open = ref(false);
</script>

<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        :aria-label="$t('chat.message_actions', 'Message actions')"
        :class="[
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          open
            ? 'opacity-100'
            : 'opacity-0 group-hover/chat-message:opacity-100 group-focus-within/chat-message:opacity-100 [@media(hover:none)]:opacity-100',
          triggerClass,
        ]"
      >
        <Ellipsis class="h-3 w-3" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align ?? 'end'" class="w-40">
      <DropdownMenuItem v-if="canEdit" @click="emit('edit')">
        <Pencil class="mr-2 h-3.5 w-3.5" />
        {{ $t("common.edit") }}
      </DropdownMenuItem>
      <DropdownMenuItem @click="emit('mute')">
        <MessageSquareOff class="mr-2 h-3.5 w-3.5" />
        {{ $t("chat.mute_player", "Mute Player") }}
      </DropdownMenuItem>
      <DropdownMenuItem
        class="text-destructive focus:text-destructive"
        @click="emit('delete')"
      >
        <Trash2 class="mr-2 h-3.5 w-3.5" />
        {{ $t("common.delete") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
