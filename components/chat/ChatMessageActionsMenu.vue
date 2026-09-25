<script setup lang="ts">
import { ref } from "vue";
import {
  Ellipsis,
  Pencil,
  Trash2,
  MessageSquareOff,
  SmilePlus,
} from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { CHAT_REACTIONS, type ChatReaction } from "~/utils/chatReactions";

defineProps<{
  canEdit: boolean;
  // Mute/Delete stay administrator-only; React is offered to everyone
  // wherever the host chat has reactions enabled.
  canModerate: boolean;
  canReact?: boolean;
  // Extra classes let each message position its own trigger while this
  // component remains the single implementation of the action menu.
  triggerClass?: string;
  align?: "start" | "end";
}>();
const emit = defineEmits<{
  (e: "edit"): void;
  (e: "mute"): void;
  (e: "delete"): void;
  (e: "react", reaction: ChatReaction): void;
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
      <DropdownMenuSub v-if="canReact">
        <DropdownMenuSubTrigger>
          <SmilePlus class="h-3.5 w-3.5" />
          {{ $t("chat.react", "React") }}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          class="flex min-w-0 items-center gap-0.5 p-1"
          :aria-label="$t('chat.choose_reaction', 'Choose a reaction')"
        >
          <DropdownMenuItem
            v-for="choice in CHAT_REACTIONS"
            :key="choice.id"
            class="size-8 justify-center p-0 text-base"
            :aria-label="`React with ${choice.emoji}`"
            @click="emit('react', choice.id)"
          >
            {{ choice.emoji }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem v-if="canEdit" @click="emit('edit')">
        <Pencil class="mr-2 h-3.5 w-3.5" />
        {{ $t("common.edit") }}
      </DropdownMenuItem>
      <template v-if="canModerate">
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
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
