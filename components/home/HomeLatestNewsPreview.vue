<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ArrowRight, Newspaper } from "lucide-vue-next";
import { order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { newsArticleListFields } from "~/graphql/newsGraphql";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { tacticalCardHeadingClasses } from "~/utilities/tacticalClasses";

interface NewsArticle {
  id: string;
  slug: string | null;
  title: string;
  teaser: string | null;
  cover_image_url: string | null;
  published_at: string | null;
}

const props = withDefaults(
  defineProps<{
    hideWhenEmpty?: boolean;
  }>(),
  {
    hideWhenEmpty: false,
  },
);

const applicationSettings = useApplicationSettingsStore();
const newsEnabled = computed(() => applicationSettings.newsEnabled);

const article = ref<NewsArticle | null>(null);
const loading = ref(false);
const requestError = ref(false);
let fetchGeneration = 0;

const articleLink = computed(() =>
  article.value?.slug ? `/news/${article.value.slug}` : "/news",
);
const shouldRender = computed(
  () =>
    newsEnabled.value &&
    (!props.hideWhenEmpty ||
      loading.value ||
      requestError.value ||
      !!article.value),
);

function formatDate(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function fetchLatestArticle() {
  const generation = ++fetchGeneration;
  loading.value = true;
  requestError.value = false;

  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        news_articles: [
          {
            where: { status: { _eq: "published" } },
            order_by: [{ published_at: order_by.desc_nulls_last }],
            limit: 1,
          },
          newsArticleListFields,
        ],
      }),
      fetchPolicy: "network-only",
    });

    if (generation !== fetchGeneration) return;
    article.value =
      (data as { news_articles: NewsArticle[] }).news_articles[0] ?? null;
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("[home-latest-news] failed to load latest article", error);
    article.value = null;
    requestError.value = true;
  } finally {
    if (generation === fetchGeneration) {
      loading.value = false;
    }
  }
}

watch(
  newsEnabled,
  (enabled) => {
    if (enabled) {
      void fetchLatestArticle();
    } else {
      fetchGeneration++;
      article.value = null;
      loading.value = false;
      requestError.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Card
    v-if="shouldRender"
    class="flex min-w-0 flex-col overflow-hidden border-border/70 bg-card/40 shadow-none"
  >
    <div class="flex items-center gap-3 px-5 pt-5">
      <Newspaper
        class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
        aria-hidden="true"
      />
      <h3 :class="tacticalCardHeadingClasses">
        Latest News
      </h3>
    </div>

    <div class="flex flex-1 flex-col px-5 pb-5 pt-4" aria-live="polite">
      <div v-if="loading" aria-label="Loading latest news">
        <Skeleton class="aspect-video w-full rounded-md" />
        <Skeleton class="mt-4 h-3 w-28" />
        <Skeleton class="mt-3 h-5 w-4/5" />
        <Skeleton class="mt-3 h-3 w-full" />
        <Skeleton class="mt-2 h-3 w-2/3" />
      </div>

      <div
        v-else-if="requestError"
        class="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center"
        role="alert"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
          Unable to load latest news
        </p>
        <button
          type="button"
          class="mt-3 min-h-10 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          @click="fetchLatestArticle"
        >
          Try again
        </button>
      </div>

      <div
        v-else-if="!article"
        class="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
          No news published yet
        </p>
      </div>

      <NuxtLink
        v-else
        :to="articleLink"
        class="group/article min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        :aria-label="`Read ${article.title}`"
      >
        <div
          class="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-background/60"
        >
          <img
            v-if="article.cover_image_url"
            :src="article.cover_image_url"
            :alt="article.title"
            loading="lazy"
            referrerpolicy="no-referrer"
            class="h-full w-full object-cover transition-transform duration-300 group-hover/article:scale-[1.03]"
          />
          <Newspaper
            v-else
            class="h-8 w-8 text-muted-foreground/35"
            aria-hidden="true"
          />
        </div>
        <p
          v-if="formatDate(article.published_at)"
          class="mt-3 text-xs text-muted-foreground"
        >
          {{ formatDate(article.published_at) }}
        </p>
        <h4
          class="mt-1 font-semibold leading-snug text-foreground transition-colors group-hover/article:text-[hsl(var(--tac-amber))]"
        >
          {{ article.title }}
        </h4>
        <p
          v-if="article.teaser"
          class="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground"
        >
          {{ article.teaser }}
        </p>
      </NuxtLink>

      <NuxtLink
        v-if="!loading"
        to="/news"
        class="mt-auto inline-flex min-h-10 items-center gap-1 self-start rounded-md pt-4 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
      >
        View all news
        <ArrowRight class="h-3 w-3" aria-hidden="true" />
      </NuxtLink>
    </div>
  </Card>
</template>
