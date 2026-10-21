<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Newspaper } from "lucide-vue-next";
import { order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { newsArticleListFields } from "~/graphql/newsGraphql";
import { dateLocale } from "~/utilities/dateLocale";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import {
  homeEmptyClasses,
  homePanelClasses,
  homePanelPaddingClasses,
  whenNearViewport,
} from "~/components/home/dashboard/homeDashboard";

// Latest News: the same published articles as before (HomeLatestNewsPreview,
// newsArticleListFields, hidden when News is off), shown as one lead story
// and up to the four before it.
type NewsArticle = {
  id: string;
  slug: string | null;
  title: string;
  teaser: string | null;
  cover_image_url: string | null;
  published_at: string | null;
};

const newsEnabled = computed(() => useApplicationSettingsStore().newsEnabled);
const root = ref<HTMLElement | null>(null);
const articles = ref<NewsArticle[]>([]);
const state = ref<"idle" | "ready" | "error">("idle");

async function load() {
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        news_articles: [
          {
            where: { status: { _eq: "published" } },
            order_by: [{ published_at: order_by.desc_nulls_last }],
            limit: 5,
          },
          newsArticleListFields,
        ],
      }),
      fetchPolicy: "network-only",
    });
    articles.value = (data as any)?.news_articles ?? [];
    state.value = "ready";
  } catch (error) {
    console.error("[home] latest news:", error);
    state.value = "error";
  }
}

let stopObserving = () => {};
onMounted(() => {
  stopObserving = whenNearViewport(root.value, () => void load());
});
onBeforeUnmount(() => stopObserving());

const link = (article: NewsArticle) => (article.slug ? `/news/${article.slug}` : "/news");
function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(dateLocale(), { year: "numeric", month: "short", day: "numeric" });
}

const lead = computed(() => articles.value[0] ?? null);
const rest = computed(() => articles.value.slice(1, 5));
// Four smaller cards share the lead story's height evenly on desktop; fewer
// simply stack from the top (no stretched, half-empty cards).
const fillsColumn = computed(() => rest.value.length >= 4);
</script>

<template>
  <section
    v-if="newsEnabled"
    ref="root"
    aria-labelledby="home-news-title"
    :class="[homePanelClasses, homePanelPaddingClasses]"
    data-testid="home-news"
  >
    <HomeSectionHeader id="home-news-title" title="Latest News" to="/news" link-label="All news" />

    <div v-if="state === 'idle'" class="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div class="aspect-[16/8] animate-pulse rounded-lg bg-muted/30"></div>
      <div class="grid gap-3">
        <div class="h-24 animate-pulse rounded-lg bg-muted/30"></div>
        <div class="h-24 animate-pulse rounded-lg bg-muted/30"></div>
      </div>
    </div>
    <p v-else-if="state === 'error'" :class="homeEmptyClasses">
      Unable to load the latest news.
      <button type="button" class="font-semibold text-[hsl(var(--tac-amber))] hover:underline" @click="load">Try again</button>
    </p>
    <p v-else-if="!lead" :class="homeEmptyClasses">No news published yet.</p>

    <div v-else class="grid gap-3" :class="rest.length ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''">
      <!-- Covers usually carry their own artwork text, so the headline sits
           under the image instead of on top of it. -->
      <NuxtLink
        :to="link(lead)"
        class="group/news flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/20 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
      >
        <!-- flex-1: if the four cards beside it are taller, the cover grows to
             fill the difference instead of leaving a gap under the text. -->
        <div class="grid aspect-[16/7] flex-1 place-items-center overflow-hidden bg-background/60">
          <img
            v-if="lead.cover_image_url"
            :src="lead.cover_image_url"
            alt=""
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            class="h-full w-full object-cover transition-transform duration-500 group-hover/news:scale-[1.02] motion-reduce:transition-none"
          />
          <Newspaper v-else class="size-10 text-muted-foreground/30" aria-hidden="true" />
        </div>
        <div class="p-4">
          <p class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))]">
            {{ formatDate(lead.published_at) }}
          </p>
          <h3 class="mt-1 text-lg font-black leading-snug tracking-tight transition-colors group-hover/news:text-[hsl(var(--tac-amber))] sm:text-xl">
            {{ lead.title }}
          </h3>
          <p v-if="lead.teaser" class="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {{ lead.teaser }}
          </p>
        </div>
      </NuxtLink>

      <div
        v-if="rest.length"
        class="grid gap-2"
        :class="fillsColumn ? 'content-start lg:auto-rows-fr lg:content-stretch' : 'content-start'"
        data-testid="home-news-rest"
      >
        <NuxtLink
          v-for="article in rest"
          :key="article.id"
          :to="link(article)"
          class="group/news flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/20 p-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
        >
          <div class="grid aspect-[4/3] w-28 shrink-0 place-items-center overflow-hidden rounded-md bg-background/60">
            <img
              v-if="article.cover_image_url"
              :src="article.cover_image_url"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              class="h-full w-full object-cover"
            />
            <Newspaper v-else class="size-6 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div class="min-w-0 py-0.5">
            <p class="text-[11px] text-muted-foreground">{{ formatDate(article.published_at) }}</p>
            <h3 class="line-clamp-2 text-sm font-bold leading-snug transition-colors group-hover/news:text-[hsl(var(--tac-amber))]">
              {{ article.title }}
            </h3>
            <p
              v-if="article.teaser"
              class="mt-1 text-xs leading-5 text-muted-foreground"
              :class="fillsColumn ? 'line-clamp-2 lg:line-clamp-1' : 'line-clamp-2'"
            >
              {{ article.teaser }}
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>
