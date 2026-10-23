<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "~/components/ui/avatar";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import NewsArticleView from "~/components/news/NewsArticleView.vue";
import NewsComments from "~/components/news/NewsComments.vue";
import { ArrowLeft, Link2, PencilLine } from "lucide-vue-next";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { order_by } from "~/generated/zeus";
import { generateQuery } from "~/graphql/graphqlGen";
import {
  newsArticleFields,
  newsPostViewFields,
} from "~/graphql/newsGraphql";
import { useNewsReadState } from "~/composables/useNewsReadState";
import { useNewsShare } from "~/composables/useNewsShare";
import type { NewsFullArticle } from "~/components/news/newsTypes";

// DEAFCS: upstream ends a post with Older/Newer links and a Latest posts grid.
// DEAFCS ends it with the article and its comments (Anders' call), so those
// queries are left out and the footer slot holds NewsComments instead. /news
// still lists every post.

const route = useRoute();
const slug = computed(() => String(route.params.slug));
// A shared link to one section lands on it.
const initialSection = computed(() =>
  route.hash ? decodeURIComponent(route.hash.slice(1)) : null,
);

const article = ref<NewsFullArticle | null>(null);
const viewCount = ref<string | null>(null);
const loading = ref(true);

const newsEnabled = computed(() => useApplicationSettingsStore().newsEnabled);
const newsLabel = computed(() => useApplicationSettingsStore().newsLabel);
const canPostNews = computed(() => useApplicationSettingsStore().canPostNews);
const apiDomain = computed(() => useRuntimeConfig().public.apiDomain);
const { markRead } = useNewsReadState();
const { copyNewsLink } = useNewsShare();

useSeoMeta({
  title: () => article.value?.title || undefined,
  ogTitle: () => article.value?.title || undefined,
  description: () => article.value?.teaser || undefined,
  ogDescription: () => article.value?.teaser || undefined,
  ogImage: () => article.value?.cover_image_url || undefined,
  ogType: "article",
  twitterCard: () =>
    article.value?.cover_image_url ? "summary_large_image" : "summary",
});

const authorAvatar = computed(() => {
  const a = article.value?.author;
  if (!a) {
    return null;
  }
  return resolveAvatarUrl(
    a.custom_avatar_url || a.avatar_url,
    apiDomain.value,
    64,
  );
});


const trackView = async (articleSlug: string | null) => {
  if (!import.meta.client || !articleSlug) {
    return;
  }
  const key = `news-viewed:${articleSlug}`;
  if (sessionStorage.getItem(key)) {
    return;
  }
  sessionStorage.setItem(key, "1");
  await fetch(
    `https://${apiDomain.value}/news/${encodeURIComponent(articleSlug)}/view`,
    {
      method: "POST",
      credentials: "include",
    },
  ).catch(() => {});
};

// The public article query can't select view_count — only authors get it, via
// the admin action, once we know which post we're on.
const fetchViewCount = async (id: string) => {
  if (!canPostNews.value) {
    return;
  }
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        newsPostAdmin: [{ id }, newsPostViewFields],
      }),
      fetchPolicy: "network-only",
    });
    viewCount.value =
      (data as { newsPostAdmin: { view_count: string } | null }).newsPostAdmin
        ?.view_count ?? null;
  } catch {
    viewCount.value = null;
  }
};

const fetchArticle = async () => {
  loading.value = true;
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        news_articles: [
          {
            where: { slug: { _eq: slug.value } },
            order_by: [{ published_at: order_by.desc_nulls_last }],
            limit: 1,
          },
          newsArticleFields,
        ],
      }),
      fetchPolicy: "network-only",
    });
    const found =
      (data as { news_articles: NewsFullArticle[] }).news_articles[0] ?? null;
    if (!found) {
      return navigateTo("/news");
    }
    article.value = found;
    markRead(found.published_at);
    // Count this visit first so authors don't read a number that's one behind.
    trackView(found.slug).finally(() => fetchViewCount(found.id));
  } catch {
    return navigateTo("/news");
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (!newsEnabled.value) {
    navigateTo("/");
    return;
  }
  fetchArticle();
});
</script>

<template>
  <PageTransition>
    <div>
      <NuxtLink
        to="/news"
        class="mb-3.5 inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        {{ newsLabel || $t("pages.news.title") }}
      </NuxtLink>

      <div
        v-if="loading"
        class="overflow-hidden rounded-2xl border border-border"
        aria-busy="true"
      >
        <Skeleton class="aspect-video max-h-[30rem] w-full rounded-none" />
        <div class="grid gap-3 px-4 pb-5 pt-4 sm:px-6 sm:pt-5">
          <Skeleton class="h-4 w-48" />
          <Skeleton class="h-10 w-2/3" />
          <Skeleton class="h-5 w-1/2" />
        </div>
      </div>

      <NewsArticleView
        v-else-if="article"
        :title="article.title"
        :teaser="article.teaser"
        :cover-image-url="article.cover_image_url"
        :content-markdown="article.content_markdown"
        :published-at="article.published_at"
        :updated-at="article.updated_at"
        :views="canPostNews ? viewCount : null"
        :slug="article.slug"
        :initial-section="initialSection"
      >
        <template v-if="article.author" #byline>
          <NuxtLink
            :to="{
              name: 'players-id',
              params: { id: article.author.steam_id },
            }"
            class="group flex min-w-0 items-center gap-2.5"
          >
            <Avatar shape="square" class="h-8 w-8">
              <AvatarImage
                v-if="authorAvatar"
                :src="authorAvatar"
                :alt="article.author.name"
              />
              <AvatarFallback>
                {{ article.author.name.slice(0, 2) }}
              </AvatarFallback>
            </Avatar>
            <span class="grid leading-tight">
              <span
                class="text-[0.8125rem] font-semibold transition-colors duration-150 group-hover:text-[hsl(var(--tac-amber))]"
              >
                {{ article.author.name }}
              </span>
              <span
                v-if="article.author.role"
                class="text-xs capitalize text-muted-foreground"
              >
                {{ $t(`player_roles.${article.author.role}`) }}
              </span>
            </span>
          </NuxtLink>
        </template>

        <template #actions>
          <Button
            v-if="article.slug"
            variant="outline"
            size="sm"
            @click="copyNewsLink(article.slug)"
          >
            <Link2 class="h-4 w-4" />
            {{ $t("pages.news.copy_link") }}
          </Button>
          <Button v-if="canPostNews" as-child variant="outline" size="sm">
            <NuxtLink :to="`/news/manage/${article.id}`">
              <PencilLine class="h-4 w-4" />
              {{ $t("pages.news.manage.edit") }}
            </NuxtLink>
          </Button>
        </template>

        <template #footer>
          <NewsComments
            :article-id="article.id"
            :published-at="article.published_at"
          />
        </template>
      </NewsArticleView>
    </div>
  </PageTransition>
</template>
