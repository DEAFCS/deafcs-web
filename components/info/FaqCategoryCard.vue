<script setup lang="ts">
import { computed } from "vue";
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
import type { FaqCategory } from "~/utilities/faqTypes";

defineProps<{
  category: FaqCategory;
}>();

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
</script>

<template>
  <div
    :id="`category-${category.key}`"
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
</template>
