<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Lock, MessageSquare } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { e_player_roles_enum } from "~/generated/zeus";
import NewsComment from "~/components/news/NewsComment.vue";
import NewsCommentComposer from "~/components/news/NewsCommentComposer.vue";
import {
  NEWS_COMMENTS_PAGE,
  newsCommentsOpen,
  useNewsComments,
  type NewsComment as Comment,
} from "~/composables/useNewsComments";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

/**
 * DEAFCS-only: the comments at the end of a News article. Verified Users and
 * above can comment, reply and +1 for the first 7 days after the article is
 * published; after that the thread stays readable but closed. The server
 * enforces every rule, this only mirrors them so players see why.
 */
const props = defineProps<{
  articleId: string;
  publishedAt: string | null;
}>();

const api = useNewsComments();
const auth = useAuthStore();
const route = useRoute();

const me = computed(() => auth.me);
const meSteamId = computed(() =>
  me.value?.steam_id ? String(me.value.steam_id) : null,
);
const signedIn = computed(() => !!me.value);
const verified = computed(() => auth.isRoleAbove(e_player_roles_enum.verified_user));
const staff = computed(() => auth.isRoleAbove(e_player_roles_enum.moderator));
const open = computed(() => newsCommentsOpen(props.publishedAt));
const canWrite = computed(() => verified.value && open.value);

const comments = ref<Comment[]>([]);
const threads = ref(0);
const visible = ref(0);
const loading = ref(true);
const loadFailed = ref(false);
const loadingMore = ref(false);
const busy = ref(false);
const replyTo = ref<string | null>(null);
const highlighted = ref<string | null>(null);
const composer = ref<InstanceType<typeof NewsCommentComposer> | null>(null);
const list = ref<HTMLElement | null>(null);

const hasMore = computed(() => comments.value.length < threads.value);

const options = () => ({ signedIn: signedIn.value, staff: staff.value });

function errorMessage(error: unknown): string {
  const graphQLErrors = (error as { graphQLErrors?: Array<{ message: string }> })
    ?.graphQLErrors;
  return (
    graphQLErrors?.[0]?.message ||
    (error as Error)?.message ||
    useNuxtApp().$i18n.t("pages.news.comments.failed")
  );
}

async function load(reset = true) {
  const loaded = reset ? 0 : comments.value.length;
  const page = await api.fetchThreads(
    props.articleId,
    reset ? 0 : loaded,
    options(),
    // A refresh reloads everything already on screen, so nothing jumps away.
    reset ? Math.max(NEWS_COMMENTS_PAGE, comments.value.length) : NEWS_COMMENTS_PAGE,
  );
  comments.value = reset ? page.comments : [...comments.value, ...page.comments];
  threads.value = page.threads;
  visible.value = page.visible;
}

async function refresh() {
  try {
    await load(true);
  } catch (error) {
    toast({ title: errorMessage(error), variant: "destructive" });
  }
}

async function loadMore() {
  loadingMore.value = true;
  try {
    await load(false);
  } finally {
    loadingMore.value = false;
  }
}

async function run(action: () => Promise<unknown>, after?: () => void) {
  if (busy.value) {
    return;
  }
  busy.value = true;
  try {
    await action();
    after?.();
    await load(true);
  } catch (error) {
    toast({ title: errorMessage(error), variant: "destructive" });
  } finally {
    busy.value = false;
  }
}

const postComment = (body: string) =>
  run(
    () => api.post(props.articleId, body),
    () => composer.value?.clear(),
  );

const postReply = (parent: Comment, body: string) =>
  run(
    () => api.post(props.articleId, body, parent.id),
    () => (replyTo.value = null),
  );

const editComment = (comment: Comment, body: string) =>
  run(() => api.edit(comment.id, body));

const removeComment = (comment: Comment) =>
  run(() => api.remove(comment.id));

const hideComment = (comment: Comment, hidden: boolean, reason?: string) =>
  run(() => api.setHidden(comment.id, hidden, reason));

// Query results are read-only (Apollo freezes them), so a comment is never
// written into: it is replaced by an updated copy, inside its parent's
// replies when it is a reply.
function patchComment(id: string, patch: Partial<Comment>) {
  const apply = (comment: Comment): Comment => {
    if (comment.id === id) {
      return { ...comment, ...patch };
    }
    if (comment.replies?.some((reply) => reply.id === id)) {
      return { ...comment, replies: comment.replies.map(apply) };
    }
    return comment;
  };
  comments.value = comments.value.map(apply);
}

// The count and pressed state come from the server's answer, so a failed
// request leaves both as they were.
async function vote(comment: Comment) {
  if (busy.value) {
    return;
  }
  busy.value = true;
  try {
    const result = await api.toggleVote(comment.id);
    patchComment(comment.id, {
      vote_count: result.vote_count,
      votes:
        result.voted && meSteamId.value ? [{ steam_id: meSteamId.value }] : [],
    });
  } catch (error) {
    toast({ title: errorMessage(error), variant: "destructive" });
  } finally {
    busy.value = false;
  }
}

function signIn() {
  navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
}

// A notification links to #comment-<id>: load until that comment is on the
// page, open its replies, then bring it into view.
async function revealLinkedComment() {
  const id = route.hash.startsWith("#comment-")
    ? decodeURIComponent(route.hash.slice("#comment-".length))
    : null;
  if (!id) {
    return;
  }
  const holds = () =>
    comments.value.some(
      (c) => c.id === id || (c.replies ?? []).some((r) => r.id === id),
    );
  while (!holds() && hasMore.value) {
    await load(false);
  }
  if (!holds()) {
    return;
  }
  // Setting the highlight also opens a folded reply (see NewsComment).
  highlighted.value = id;
  await nextTick();
  list.value
    ?.querySelector(`[data-comment-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: "center" });
  setTimeout(() => (highlighted.value = null), 4000);
}

onMounted(async () => {
  try {
    await load(true);
  } catch {
    // Shown in place of the list; the article itself is unaffected.
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
  // After the list is on the page, so there is something to scroll to.
  revealLinkedComment().catch(() => {});
});

// Signing in or out changes which fields we may read (own +1s, staff text).
watch([signedIn, staff], () => refresh());
</script>

<template>
  <section
    id="comments"
    class="mx-auto mt-12 grid max-w-[66rem] scroll-mt-24 gap-4"
    :aria-label="$t('pages.news.comments.title')"
  >
    <h2 :class="[tacticalSectionLabelClasses, 'mb-0']">
      <span :class="tacticalSectionTickClasses"></span>
      {{ $t("pages.news.comments.title") }}
      <span
        v-if="!loading && !loadFailed"
        class="ml-1 tabular-nums text-muted-foreground"
        data-testid="comment-count"
        >{{ visible }}</span
      >
    </h2>

    <div class="rounded-xl border border-border bg-card/40 p-3 sm:p-4">
      <!-- Who can write here, and why not when they can't. -->
      <div v-if="!open" class="flex items-center gap-2.5 text-sm text-muted-foreground" data-testid="comments-closed">
        <Lock class="h-4 w-4 shrink-0" />
        {{ $t("pages.news.comments.closed") }}
      </div>
      <div
        v-else-if="!signedIn"
        class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"
        data-testid="comments-sign-in"
      >
        <MessageSquare class="h-4 w-4 shrink-0" />
        <span class="flex-1">{{ $t("pages.news.comments.sign_in_prompt") }}</span>
        <Button size="sm" variant="outline" @click="signIn">
          {{ $t("pages.news.comments.sign_in") }}
        </Button>
      </div>
      <div
        v-else-if="!verified"
        class="flex items-center gap-2.5 text-sm text-muted-foreground"
        data-testid="comments-verified-only"
      >
        <MessageSquare class="h-4 w-4 shrink-0" />
        {{ $t("pages.news.comments.verified_only") }}
      </div>
      <NewsCommentComposer
        v-else
        ref="composer"
        :placeholder="$t('pages.news.comments.placeholder')"
        :submit-label="$t('pages.news.comments.post')"
        :busy="busy"
        :cancellable="false"
        @submit="postComment"
      />
    </div>

    <div v-if="loading" class="grid gap-3" aria-busy="true">
      <div v-for="n in 3" :key="n" class="flex gap-3 px-3">
        <Skeleton class="h-8 w-8 rounded-md" />
        <div class="grid flex-1 gap-2">
          <Skeleton class="h-3.5 w-40" />
          <Skeleton class="h-4 w-3/4" />
        </div>
      </div>
    </div>

    <p
      v-else-if="loadFailed"
      class="m-0 px-1 text-sm text-muted-foreground"
      data-testid="comments-failed"
    >
      {{ $t("pages.news.comments.load_failed") }}
    </p>

    <p
      v-else-if="!comments.length"
      class="m-0 px-1 text-sm text-muted-foreground"
      data-testid="comments-empty"
    >
      {{
        open
          ? $t("pages.news.comments.empty_open")
          : $t("pages.news.comments.empty_closed")
      }}
    </p>

    <ol v-else ref="list" class="m-0 grid gap-1 p-0">
      <NewsComment
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        :me-steam-id="meSteamId"
        :can-write="canWrite"
        :staff="staff"
        :busy="busy"
        :highlighted="highlighted"
        :reply-to="replyTo"
        @reply="(c: Comment) => (replyTo = c.id)"
        @cancel-reply="replyTo = null"
        @submit-reply="postReply"
        @vote="vote"
        @edit="editComment"
        @remove="removeComment"
        @hide="hideComment"
      />
    </ol>

    <div v-if="hasMore" class="flex justify-center">
      <Button
        variant="outline"
        :loading="loadingMore"
        data-testid="comments-more"
        @click="loadMore"
      >
        {{ $t("pages.news.comments.show_more") }}
      </Button>
    </div>
  </section>
</template>
