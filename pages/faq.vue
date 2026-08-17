<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import InfoPage from "~/components/info/InfoPage.vue";
import { Card, CardContent } from "~/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";
import { RANK_TIERS, PROVISIONAL_TIER } from "~/utils/eloTier";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.faq.title"),
});

// Reuses the same tier thresholds/colors as PlayerElo.vue and the
// leaderboard (utils/eloTier.ts) rather than duplicating them here.
const numberFormat = new Intl.NumberFormat("en-US");
const eloTiers = computed(() => {
  const ascending = [PROVISIONAL_TIER, ...[...RANK_TIERS].reverse()];
  return ascending.map((tier, index) => {
    const next = ascending[index + 1];
    const range =
      index === 0
        ? `Below ${numberFormat.format(ascending[1].threshold)}`
        : next
          ? `${numberFormat.format(tier.threshold)} – ${numberFormat.format(next.threshold - 1)}`
          : `${numberFormat.format(tier.threshold)}+`;
    return { label: tier.label, rgb: tier.rgb, range };
  });
});

const matchmakingModes = ["competitive", "wingman", "duel"] as const;

// Nuxt's client-side router doesn't scroll same-page hash links (no
// scrollBehavior configured), so same-page cross-references between FAQ
// categories are handled locally instead of relying on <NuxtLink to="#...">.
function scrollToCategory(hash: string) {
  document
    .getElementById(hash.replace(/^#/, ""))
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface FaqLink {
  to: string;
  labelKey: string;
  // Vue's dynamic slot-name syntax (#[expr]) can't contain a ternary/spaces,
  // so the target slot is precomputed here rather than derived in the template.
  slot: "link" | "link2";
}

interface FaqItem {
  key: string;
  links?: FaqLink[];
}

interface FaqCategory {
  key: string;
  items: FaqItem[];
}

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
</script>

<template>
  <InfoPage
    :title="$t('pages.info.faq.title')"
    :intro="$t('pages.info.faq.intro')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <div
      v-for="category in categories"
      :id="`category-${category.key}`"
      :key="category.key"
      class="flex flex-col gap-3 scroll-mt-20"
    >
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t(`pages.info.faq.categories.${category.key}.title`) }}
      </span>

      <Card class="bg-card/20">
        <CardContent class="p-2 sm:p-4">
          <Accordion type="multiple">
            <AccordionItem
              v-for="item in category.items"
              :key="item.key"
              :value="item.key"
              class="px-2"
            >
              <AccordionTrigger>
                {{
                  $t(
                    `pages.info.faq.categories.${category.key}.items.${item.key}.q`,
                  )
                }}
              </AccordionTrigger>
              <AccordionContent
                class="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground"
              >
                <template v-if="item.key === 'how_elo_works'">
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.elo_and_seasons.items.how_elo_works.intro",
                      )
                    }}
                  </p>
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.elo_and_seasons.items.how_elo_works.performance",
                      )
                    }}
                  </p>
                  <i18n-t
                    keypath="pages.info.faq.categories.elo_and_seasons.items.how_elo_works.stats_guide_link"
                    tag="p"
                    scope="global"
                  >
                    <template #link>
                      <NuxtLink
                        to="/stats-guide"
                        class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
                      >
                        {{
                          $t(
                            "pages.info.faq.categories.elo_and_seasons.items.how_elo_works.stats_guide_label",
                          )
                        }}
                      </NuxtLink>
                    </template>
                  </i18n-t>
                </template>

                <template v-else-if="item.key === 'elo_tiers'">
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.elo_and_seasons.items.elo_tiers.intro",
                      )
                    }}
                  </p>
                  <ul
                    class="flex flex-col gap-1 sm:grid sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-4 sm:gap-x-4 sm:gap-y-1"
                  >
                    <li
                      v-for="tier in eloTiers"
                      :key="tier.label"
                      class="flex min-w-0 items-center justify-between gap-3 rounded-md bg-card/30 px-2.5 py-1.5"
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <span
                          class="h-2.5 w-2.5 shrink-0 rounded-full"
                          :style="{ backgroundColor: `rgb(${tier.rgb})` }"
                        ></span>
                        <span
                          class="whitespace-nowrap text-xs font-medium text-foreground/90"
                          >{{ tier.label }}</span
                        >
                      </span>
                      <span
                        class="shrink-0 text-xs tabular-nums text-muted-foreground"
                        >{{ tier.range }}</span
                      >
                    </li>
                  </ul>
                </template>

                <template v-else-if="item.key === 'modes_available'">
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.matchmaking.items.modes_available.intro",
                      )
                    }}
                  </p>
                  <ul class="flex flex-col gap-2">
                    <li
                      v-for="mode in matchmakingModes"
                      :key="mode"
                      class="flex flex-col gap-0.5 sm:flex-row sm:gap-2"
                    >
                      <span class="shrink-0 font-semibold text-foreground/90">
                        {{ $t(`pages.leaderboard.match_types.${mode}`) }}
                      </span>
                      <span>
                        {{
                          $t(
                            `pages.info.faq.categories.matchmaking.items.modes_available.modes.${mode}`,
                          )
                        }}
                      </span>
                    </li>
                  </ul>
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.matchmaking.items.modes_available.note",
                      )
                    }}
                  </p>
                </template>

                <template v-else-if="item.key === 'create_join_team'">
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.teams_tournaments.items.create_join_team.normal_team",
                      )
                    }}
                  </p>
                  <p>
                    {{
                      $t(
                        "pages.info.faq.categories.teams_tournaments.items.create_join_team.tournament_team",
                      )
                    }}
                  </p>
                </template>

                <p v-else-if="!item.links">
                  {{
                    $t(
                      `pages.info.faq.categories.${category.key}.items.${item.key}.a`,
                    )
                  }}
                </p>
                <i18n-t
                  v-else
                  :keypath="`pages.info.faq.categories.${category.key}.items.${item.key}.a`"
                  tag="p"
                  scope="global"
                >
                  <template
                    v-for="link in item.links"
                    :key="link.to"
                    #[link.slot]
                  >
                    <button
                      v-if="link.to.startsWith('#')"
                      type="button"
                      class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
                      @click="scrollToCategory(link.to)"
                    >
                      {{ $t(link.labelKey) }}
                    </button>
                    <NuxtLink
                      v-else
                      :to="link.to"
                      class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
                    >
                      {{ $t(link.labelKey) }}
                    </NuxtLink>
                  </template>
                </i18n-t>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
