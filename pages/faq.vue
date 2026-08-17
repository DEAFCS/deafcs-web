<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useMediaQuery } from "@vueuse/core";
import InfoPage from "~/components/info/InfoPage.vue";
import FaqCategoryCard from "~/components/info/FaqCategoryCard.vue";
import type { FaqCategory, FaqLink } from "~/utilities/faqTypes";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.faq.title"),
});

// Matches the lg: breakpoint MainContent.vue itself uses to widen the shared
// page frame, so the FAQ only splits into two columns once the page is
// actually wide enough to hold them comfortably.
const isDesktop = useMediaQuery("(min-width: 1024px)");

const CONTACT_LINK: FaqLink = {
  to: "/contact",
  labelKey: "pages.info.contact.title",
  slot: "link",
};
const ACCOUNT_DATA_LINK: FaqLink = {
  to: "/account-data",
  labelKey: "pages.info.account_data.title",
  slot: "link",
};
const MATCHMAKING_RULES_LINK: FaqLink = {
  to: "/matchmaking-rules",
  labelKey: "pages.info.matchmaking_rules.title",
  slot: "link",
};
// Same-page anchor down to the Draft category card (id set on its wrapper
// below) rather than a separate route.
const DRAFT_SECTION_LINK: FaqLink = {
  to: "#category-draft",
  labelKey: "pages.info.faq.categories.draft.title",
  slot: "link",
};

// Single source of truth, rendered in this exact order on mobile. Desktop
// splits the same categories (each still rendered exactly once, never
// duplicated) into two independent columns below.
const categories: FaqCategory[] = [
  {
    key: "getting_started",
    items: [
      { key: "what_is_deafcs" },
      { key: "who_can_use", links: [CONTACT_LINK] },
      { key: "how_sign_in" },
      { key: "need_discord" },
      { key: "free_to_use" },
    ],
  },
  {
    key: "account",
    items: [
      { key: "why_steam" },
      { key: "change_nickname_avatar" },
      { key: "deactivate_account", links: [ACCOUNT_DATA_LINK] },
      { key: "historical_records", links: [ACCOUNT_DATA_LINK] },
      { key: "return_later", links: [ACCOUNT_DATA_LINK] },
    ],
  },
  {
    key: "elo_and_seasons",
    items: [
      { key: "how_elo_works" },
      { key: "elo_per_mode" },
      { key: "season_reset" },
      { key: "elo_tiers" },
      { key: "draft_elo", links: [DRAFT_SECTION_LINK] },
    ],
  },
  {
    key: "matchmaking",
    items: [
      { key: "how_matchmaking_works" },
      { key: "modes_available" },
      { key: "queue_with_friends", links: [MATCHMAKING_RULES_LINK] },
      { key: "leave_abandon", links: [MATCHMAKING_RULES_LINK] },
    ],
  },
  {
    key: "servers",
    items: [
      { key: "where_located" },
      { key: "preferred_server" },
      { key: "server_problems", links: [CONTACT_LINK] },
      { key: "ping_difference" },
      { key: "add_server_location" },
    ],
  },
  {
    key: "draft",
    items: [
      { key: "how_draft_works" },
      { key: "fun_only" },
      { key: "workshop_maps" },
      { key: "draft_elo" },
    ],
  },
  {
    key: "teams_tournaments",
    items: [
      { key: "create_join_team" },
      { key: "join_tournament" },
      { key: "organize_tournament", links: [CONTACT_LINK] },
      {
        key: "tournament_rules",
        links: [
          {
            to: "/tournament-rules",
            labelKey: "pages.info.tournament_rules.title",
            slot: "link",
          },
        ],
      },
      { key: "leagues" },
    ],
  },
  {
    key: "highlights",
    items: [
      { key: "earn_highlight" },
      { key: "highlights_per_match" },
      { key: "highlight_retention" },
      { key: "highlight_disappear" },
    ],
  },
  {
    key: "community_support",
    items: [
      { key: "report_problem", links: [CONTACT_LINK] },
      { key: "suggest_feature", links: [CONTACT_LINK] },
      {
        key: "news_highlights",
        links: [
          { to: "/news", labelKey: "pages.news.title", slot: "link" },
          {
            to: "/highlights",
            labelKey: "pages.highlights.title",
            slot: "link2",
          },
        ],
      },
      { key: "contact_deafcs", links: [CONTACT_LINK] },
    ],
  },
];

// Desktop-only visual split into two independent columns (5 + 4, chosen for
// balance: ELO & Seasons and Servers both carry 5 items, Matchmaking and
// Draft both carry 4). Each category still renders exactly once overall —
// never duplicated — since only one of the mobile/desktop branches below is
// ever mounted at a time.
const LEFT_CATEGORY_KEYS = [
  "getting_started",
  "elo_and_seasons",
  "matchmaking",
  "teams_tournaments",
  "community_support",
];
const RIGHT_CATEGORY_KEYS = ["account", "servers", "draft", "highlights"];

function pickCategories(keys: string[]): FaqCategory[] {
  return keys.map((key) => categories.find((c) => c.key === key)!);
}

const leftCategories = pickCategories(LEFT_CATEGORY_KEYS);
const rightCategories = pickCategories(RIGHT_CATEGORY_KEYS);
</script>

<template>
  <InfoPage
    :title="$t('pages.info.faq.title')"
    :intro="$t('pages.info.faq.intro')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <!--
      Desktop: two independent column containers rather than a shared grid
      row, so an accordion expanding in one column never stretches or
      leaves a blank gap in the other. Mobile (v-else): a single flow in
      the original logical category order. isDesktop being reactive means
      only one branch is ever mounted at a time — no duplicate ids, no
      duplicated accordion state to keep in sync.
    -->
    <div v-if="isDesktop" class="grid grid-cols-2 gap-6">
      <div class="flex flex-col gap-6">
        <FaqCategoryCard
          v-for="category in leftCategories"
          :key="category.key"
          :category="category"
        />
      </div>
      <div class="flex flex-col gap-6">
        <FaqCategoryCard
          v-for="category in rightCategories"
          :key="category.key"
          :category="category"
        />
      </div>
    </div>
    <template v-else>
      <FaqCategoryCard
        v-for="category in categories"
        :key="category.key"
        :category="category"
      />
    </template>
  </div>
</template>
