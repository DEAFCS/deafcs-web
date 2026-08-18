<script setup lang="ts">
import { useI18n } from "vue-i18n";
import InfoPage from "~/components/info/InfoPage.vue";
import { Card, CardContent } from "~/components/ui/card";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.matchmaking_rules.title"),
});

const bodyClasses = "text-sm leading-relaxed text-foreground/90";
const linkClasses =
  "font-semibold text-[hsl(var(--tac-amber))] hover:underline";
const ggCodeClasses = "rounded bg-secondary px-1.5 py-0.5 text-xs";
</script>

<template>
  <InfoPage
    :title="$t('pages.info.matchmaking_rules.title')"
    :intro="$t('pages.info.matchmaking_rules.intro')"
  >
    <i18n-t
      keypath="pages.info.matchmaking_rules.intro_2"
      tag="p"
      scope="global"
      :class="bodyClasses"
    >
      <template #link>
        <NuxtLink to="/general-rules" :class="linkClasses">
          {{ $t("pages.info.general_rules.title") }}
        </NuxtLink>
      </template>
      <template #link2>
        <NuxtLink to="/tournament-rules" :class="linkClasses">
          {{ $t("pages.info.tournament_rules.title") }}
        </NuxtLink>
      </template>
    </i18n-t>
  </InfoPage>

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <!-- Matchmaking Eligibility + Queue & Parties: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.eligibility.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.eligibility.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.eligibility.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.eligibility.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.queue_parties.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.queue_parties.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.queue_parties.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.queue_parties.body_3") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.queue_parties.body_4") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Ready / Match Acceptance + During the Match: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.ready_check.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.ready_check.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.ready_check.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.ready_check.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.during_match.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.during_match.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.during_match.body_2") }}
            </p>
            <i18n-t
              keypath="pages.info.matchmaking_rules.sections.during_match.body_3"
              tag="p"
              scope="global"
              :class="bodyClasses"
            >
              <template #gg>
                <code :class="ggCodeClasses">.gg</code>
              </template>
            </i18n-t>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Leaving, Abandoning & AFK: longer and high-importance, kept full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.matchmaking_rules.sections.leaving_abandoning.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.matchmaking_rules.sections.leaving_abandoning.body_1") }}
          </p>
          <i18n-t
            keypath="pages.info.matchmaking_rules.sections.leaving_abandoning.body_2"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #gg>
              <code :class="ggCodeClasses">.gg</code>
            </template>
          </i18n-t>
          <p :class="bodyClasses">
            {{ $t("pages.info.matchmaking_rules.sections.leaving_abandoning.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.matchmaking_rules.sections.leaving_abandoning.body_4") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.matchmaking_rules.sections.leaving_abandoning.body_5") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Disconnects & Server Problems + Competitive Integrity: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.disconnects.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <i18n-t
              keypath="pages.info.matchmaking_rules.sections.disconnects.body_1"
              tag="p"
              scope="global"
              :class="bodyClasses"
            >
              <template #gg>
                <code :class="ggCodeClasses">.gg</code>
              </template>
            </i18n-t>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.disconnects.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.competitive_integrity.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.competitive_integrity.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.competitive_integrity.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Sanctions & Cooldowns: short, cross-references General Rules rather than duplicating. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.matchmaking_rules.sections.sanctions.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.matchmaking_rules.sections.sanctions.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.matchmaking_rules.sections.sanctions.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Elo & Results + Staff & Organizer Decisions: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.elo_results.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.elo_results.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.elo_results.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.elo_results.body_3") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.elo_results.body_4") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.matchmaking_rules.sections.staff_decisions.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.staff_decisions.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.matchmaking_rules.sections.staff_decisions.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
