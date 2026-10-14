<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  CornerDownRight,
  EyeOff,
  Eye,
  PencilLine,
  ThumbsUp,
  Trash2,
} from "lucide-vue-next";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import TimeAgo from "~/components/TimeAgo.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import TeamsEmblem from "~/components/teams/TeamsEmblem.vue";
import NewsCommentComposer from "~/components/news/NewsCommentComposer.vue";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import { dateLocale } from "~/utilities/dateLocale";
import { linkifyCommentText } from "~/utilities/newsCommentText";
import {
  newsCommentEditable,
  newsCommentTeam,
  type NewsComment,
} from "~/composables/useNewsComments";

/**
 * DEAFCS-only: one News comment, HLTV-style but on DEAFCS surfaces. Replies
 * sit under their comment, one level deep. There is deliberately no Report
 * action (Anders); staff hide and restore instead.
 */
const props = defineProps<{
  comment: NewsComment;
  /** Signed-in viewer, null for guests. */
  meSteamId: string | null;
  /** Viewer may post, reply and +1 (Verified User and above, thread open). */
  canWrite: boolean;
  /** Viewer is staff (moderator and above). */
  staff: boolean;
  busy?: boolean;
  highlighted?: string | null;
  replyTo?: string | null;
  isReply?: boolean;
}>();

const emit = defineEmits<{
  reply: [comment: NewsComment];
  cancelReply: [];
  submitReply: [parent: NewsComment, body: string];
  vote: [comment: NewsComment];
  edit: [comment: NewsComment, body: string];
  remove: [comment: NewsComment];
  hide: [comment: NewsComment, hidden: boolean, reason?: string];
}>();

const REPLIES_SHOWN = 3;
const showAllReplies = ref(false);
const editing = ref(false);
const confirming = ref<"delete" | "hide" | null>(null);
const hideReason = ref("");

const apiDomain = computed(() => useRuntimeConfig().public.apiDomain);
const author = computed(() => props.comment.author);
const avatar = computed(() =>
  author.value
    ? resolveAvatarUrl(
        author.value.custom_avatar_url || author.value.avatar_url,
        apiDomain.value,
      )
    : null,
);
const team = computed(() => newsCommentTeam(author.value));
const mine = computed(
  () =>
    !!props.meSteamId &&
    String(props.comment.author_steam_id) === String(props.meSteamId),
);
const removed = computed(
  () => !!props.comment.deleted_at || !!props.comment.hidden_at,
);
const voted = computed(() => (props.comment.votes?.length ?? 0) > 0);
const canVote = computed(
  () => props.canWrite && !mine.value && !removed.value,
);
const canEdit = computed(
  () => mine.value && props.canWrite && newsCommentEditable(props.comment),
);
const parts = computed(() => linkifyCommentText(props.comment.text ?? ""));
const replies = computed(() => props.comment.replies ?? []);
const shownReplies = computed(() =>
  showAllReplies.value ? replies.value : replies.value.slice(0, REPLIES_SHOWN),
);
const fullDate = computed(() =>
  new Date(props.comment.created_at).toLocaleString(dateLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }),
);

async function startEdit() {
  editing.value = true;
  await nextTick();
}

function saveEdit(body: string) {
  editing.value = false;
  emit("edit", props.comment, body);
}

function confirmHide() {
  emit("hide", props.comment, true, hideReason.value.trim() || undefined);
  confirming.value = null;
  hideReason.value = "";
}

// A notification that links to a folded reply opens the fold.
watch(
  () => props.highlighted,
  (id) => {
    if (id && replies.value.some((reply) => reply.id === id)) {
      showAllReplies.value = true;
    }
  },
  { immediate: true },
);
</script>

<template>
  <li
    :id="`comment-${comment.id}`"
    class="scroll-mt-24 list-none"
    :data-comment-id="comment.id"
  >
    <div
      class="group/comment flex gap-3 rounded-lg px-2 py-2.5 transition-colors duration-500 sm:px-3"
      :class="
        highlighted === comment.id
          ? 'bg-[hsl(var(--tac-amber)/0.1)] ring-1 ring-[hsl(var(--tac-amber)/0.45)]'
          : 'hover:bg-muted/20'
      "
    >
      <NuxtLink
        v-if="author"
        :to="{ name: 'players-id', params: { id: author.steam_id } }"
        class="shrink-0"
        :aria-label="author.name"
      >
        <Avatar shape="square" :class="isReply ? 'h-7 w-7' : 'h-8 w-8'">
          <AvatarImage v-if="avatar" :src="avatar" :alt="author.name" />
          <AvatarFallback>{{ author.name.slice(0, 2) }}</AvatarFallback>
        </Avatar>
      </NuxtLink>

      <div class="min-w-0 flex-1">
        <div
          class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] leading-tight"
        >
          <NuxtLink
            v-if="author"
            :to="{ name: 'players-id', params: { id: author.steam_id } }"
            class="min-w-0 truncate font-semibold transition-colors duration-150 hover:text-[hsl(var(--tac-amber))]"
            :class="mine && 'text-[hsl(var(--tac-amber))]'"
          >
            {{ author.name }}
          </NuxtLink>
          <TimezoneFlag
            v-if="author?.country"
            :country="author.country"
            class="text-sm leading-none"
            :title="author.country"
            data-testid="comment-flag"
          />
          <NuxtLink
            v-if="team"
            :to="`/teams/${team.id}`"
            :title="team.name"
            data-testid="comment-team"
            class="inline-flex"
          >
            <TeamsEmblem :team="team" :size="18" />
          </NuxtLink>
          <span class="text-xs text-muted-foreground" :title="fullDate">
            <TimeAgo :date="comment.created_at" hide-icon />
          </span>
          <span
            v-if="comment.edited_at && !removed"
            class="text-xs text-muted-foreground"
          >
            · {{ $t("pages.news.comments.edited") }}
          </span>
          <span
            v-if="staff && comment.hidden_at"
            class="rounded bg-destructive/15 px-1.5 py-px text-[0.6875rem] font-semibold text-destructive"
          >
            {{ $t("pages.news.comments.hidden_badge") }}
          </span>
        </div>

        <NewsCommentComposer
          v-if="editing"
          class="mt-2"
          :initial="comment.text ?? ''"
          :submit-label="$t('pages.news.comments.save')"
          :busy="busy"
          autofocus
          @submit="saveEdit"
          @cancel="editing = false"
        />
        <p
          v-else-if="comment.deleted_at"
          class="m-0 mt-1 text-sm italic text-muted-foreground"
        >
          {{ $t("pages.news.comments.deleted") }}
        </p>
        <p
          v-else-if="comment.hidden_at && !comment.text"
          class="m-0 mt-1 text-sm italic text-muted-foreground"
        >
          {{ $t("pages.news.comments.removed_by_staff") }}
        </p>
        <p
          v-else
          class="m-0 mt-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-foreground/90"
          :class="comment.hidden_at && 'opacity-60'"
          data-testid="comment-text"
        >
          <template v-for="(part, index) in parts" :key="index">
            <a
              v-if="part.href"
              :href="part.href"
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              class="text-[hsl(var(--tac-amber))] underline decoration-[hsl(var(--tac-amber)/0.45)] underline-offset-2 hover:decoration-[hsl(var(--tac-amber))]"
              >{{ part.text }}</a
            ><template v-else>{{ part.text }}</template>
          </template>
        </p>
        <p
          v-if="staff && comment.hidden_at && comment.hidden_reason"
          class="m-0 mt-1 text-xs text-muted-foreground"
        >
          {{
            $t("pages.news.comments.hidden_reason", {
              reason: comment.hidden_reason,
            })
          }}
        </p>

        <div
          v-if="!editing"
          class="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs"
        >
          <button
            v-if="canWrite && !removed"
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            data-testid="comment-reply"
            @click="emit('reply', comment)"
          >
            <CornerDownRight class="h-3.5 w-3.5" />
            {{ $t("pages.news.comments.reply") }}
          </button>

          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded-md px-2 font-semibold tabular-nums transition-colors disabled:cursor-default"
            :class="
              voted
                ? 'bg-[hsl(var(--tac-amber)/0.15)] text-[hsl(var(--tac-amber))]'
                : canVote
                  ? 'text-muted-foreground hover:bg-[hsl(var(--tac-amber)/0.1)] hover:text-[hsl(var(--tac-amber))]'
                  : 'text-muted-foreground/70'
            "
            :disabled="!canVote || busy"
            :aria-pressed="voted"
            :aria-label="$t('pages.news.comments.plus_one_label', { count: comment.vote_count })"
            :title="
              mine
                ? $t('pages.news.comments.own_vote')
                : $t('pages.news.comments.plus_one')
            "
            data-testid="comment-vote"
            @click="emit('vote', comment)"
          >
            <ThumbsUp class="h-3.5 w-3.5" />
            +{{ comment.vote_count }}
          </button>

          <template v-if="mine && !removed">
            <button
              v-if="canEdit"
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              data-testid="comment-edit"
              @click="startEdit"
            >
              <PencilLine class="h-3.5 w-3.5" />
              {{ $t("pages.news.comments.edit") }}
            </button>
            <button
              v-if="confirming !== 'delete'"
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid="comment-delete"
              @click="confirming = 'delete'"
            >
              <Trash2 class="h-3.5 w-3.5" />
              {{ $t("pages.news.comments.delete") }}
            </button>
            <span v-else class="inline-flex items-center gap-1.5 pl-1">
              {{ $t("pages.news.comments.delete_confirm") }}
              <Button
                size="sm"
                variant="destructive"
                class="h-7 px-2 text-xs"
                @click="
                  confirming = null;
                  emit('remove', comment);
                "
              >
                {{ $t("pages.news.comments.delete") }}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs"
                @click="confirming = null"
              >
                {{ $t("common.cancel") }}
              </Button>
            </span>
          </template>

          <template v-if="staff && !comment.deleted_at">
            <button
              v-if="comment.hidden_at"
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              data-testid="comment-restore"
              @click="emit('hide', comment, false)"
            >
              <Eye class="h-3.5 w-3.5" />
              {{ $t("pages.news.comments.restore") }}
            </button>
            <button
              v-else-if="confirming !== 'hide'"
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              data-testid="comment-hide"
              @click="confirming = 'hide'"
            >
              <EyeOff class="h-3.5 w-3.5" />
              {{ $t("pages.news.comments.hide") }}
            </button>
            <span
              v-else
              class="flex w-full flex-wrap items-center gap-1.5 pt-1 sm:w-auto sm:pt-0"
            >
              <input
                v-model="hideReason"
                type="text"
                maxlength="500"
                class="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs sm:w-48 sm:flex-none"
                :placeholder="$t('pages.news.comments.hide_reason_placeholder')"
              />
              <Button
                size="sm"
                variant="destructive"
                class="h-7 px-2 text-xs"
                @click="confirmHide"
              >
                {{ $t("pages.news.comments.hide") }}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs"
                @click="confirming = null"
              >
                {{ $t("common.cancel") }}
              </Button>
            </span>
          </template>
        </div>

        <NewsCommentComposer
          v-if="replyTo === comment.id"
          class="mt-2"
          :initial="''"
          :placeholder="
            $t('pages.news.comments.reply_placeholder', {
              name: author?.name ?? '',
            })
          "
          :submit-label="$t('pages.news.comments.reply')"
          :busy="busy"
          autofocus
          @submit="(body: string) => emit('submitReply', comment, body)"
          @cancel="emit('cancelReply')"
        />
      </div>
    </div>

    <ol
      v-if="!isReply && replies.length"
      class="m-0 ml-5 grid gap-0.5 border-l border-border/70 p-0 pl-2 sm:ml-7 sm:pl-3"
    >
      <NewsComment
        v-for="reply in shownReplies"
        :key="reply.id"
        :comment="reply"
        :me-steam-id="meSteamId"
        :can-write="canWrite"
        :staff="staff"
        :busy="busy"
        :highlighted="highlighted"
        :reply-to="null"
        is-reply
        @reply="emit('reply', comment)"
        @vote="(c: NewsComment) => emit('vote', c)"
        @edit="(c: NewsComment, body: string) => emit('edit', c, body)"
        @remove="(c: NewsComment) => emit('remove', c)"
        @hide="(c: NewsComment, hidden: boolean, reason?: string) => emit('hide', c, hidden, reason)"
      />
      <li v-if="replies.length > shownReplies.length" class="list-none">
        <button
          type="button"
          class="ml-2 inline-flex h-7 items-center text-xs font-semibold text-[hsl(var(--tac-amber))] hover:underline sm:ml-3"
          data-testid="comment-more-replies"
          @click="showAllReplies = true"
        >
          {{
            $t("pages.news.comments.more_replies", {
              count: replies.length - shownReplies.length,
            })
          }}
        </button>
      </li>
    </ol>
  </li>
</template>
