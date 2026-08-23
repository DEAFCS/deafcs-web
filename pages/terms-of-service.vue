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
  title: () => t("pages.info.terms_of_service.title"),
});

const bodyClasses = "text-sm leading-relaxed text-foreground/90";
const linkClasses =
  "font-semibold text-[hsl(var(--tac-amber))] hover:underline";
</script>

<template>
  <InfoPage
    :title="$t('pages.info.terms_of_service.title')"
    :intro="$t('pages.info.terms_of_service.intro')"
    :last-updated="$t('pages.info.terms_of_service.last_updated_date')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <!-- Acceptance of These Terms: opening section, full width for the 3-link paragraph. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.terms_of_service.sections.acceptance.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.acceptance.body_1") }}
          </p>
          <i18n-t
            keypath="pages.info.terms_of_service.sections.acceptance.body_2"
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
              <NuxtLink to="/matchmaking-rules" :class="linkClasses">
                {{ $t("pages.info.matchmaking_rules.title") }}
              </NuxtLink>
            </template>
            <template #link3>
              <NuxtLink to="/tournament-rules" :class="linkClasses">
                {{ $t("pages.info.tournament_rules.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
          <i18n-t
            keypath="pages.info.terms_of_service.sections.acceptance.body_3"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/privacy-policy" :class="linkClasses">
                {{ $t("pages.info.privacy_policy.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.acceptance.body_4") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Eligibility & Accounts + Steam Identity & Competitive Identity: paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.eligibility_accounts.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.eligibility_accounts.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.eligibility_accounts.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.eligibility_accounts.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.steam_identity.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.steam_identity.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.steam_identity.body_2") }}
            </p>
            <i18n-t
              keypath="pages.info.terms_of_service.sections.steam_identity.closing"
              tag="p"
              scope="global"
              class="text-xs leading-relaxed text-muted-foreground"
            >
              <template #link>
                <NuxtLink to="/account-data" :class="linkClasses">
                  {{ $t("pages.info.account_data.title") }}
                </NuxtLink>
              </template>
            </i18n-t>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Player Verification: high-importance, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.terms_of_service.sections.verification.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.verification.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.verification.body_2") }}
          </p>
          <i18n-t
            keypath="pages.info.terms_of_service.sections.verification.body_3"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/general-rules" :class="linkClasses">
                {{ $t("pages.info.general_rules.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.verification.body_4") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Fair Play & Rules + Sanctions & Enforcement: both reference the rules pages, full width for the multi-link paragraphs. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.terms_of_service.sections.fair_play.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.terms_of_service.sections.fair_play.body_1"
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
              <NuxtLink to="/matchmaking-rules" :class="linkClasses">
                {{ $t("pages.info.matchmaking_rules.title") }}
              </NuxtLink>
            </template>
            <template #link3>
              <NuxtLink to="/tournament-rules" :class="linkClasses">
                {{ $t("pages.info.tournament_rules.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.fair_play.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.fair_play.body_3") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.terms_of_service.sections.sanctions.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.terms_of_service.sections.sanctions.body_1"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/general-rules" :class="linkClasses">
                {{ $t("pages.info.general_rules.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
          <p :class="bodyClasses">
            {{ $t("pages.info.terms_of_service.sections.sanctions.body_2") }}
          </p>
          <i18n-t
            keypath="pages.info.terms_of_service.sections.sanctions.closing"
            tag="p"
            scope="global"
            class="text-xs leading-relaxed text-muted-foreground"
          >
            <template #link>
              <NuxtLink to="/contact" :class="linkClasses">
                {{ $t("pages.info.contact.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </CardContent>
      </Card>
    </div>

    <!-- Teams, Tournaments & Organizers + Prizes & Awards: paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.teams_tournaments.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.teams_tournaments.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.teams_tournaments.body_2") }}
            </p>
            <i18n-t
              keypath="pages.info.terms_of_service.sections.teams_tournaments.closing"
              tag="p"
              scope="global"
              class="text-xs leading-relaxed text-muted-foreground"
            >
              <template #link>
                <NuxtLink to="/tournament-rules" :class="linkClasses">
                  {{ $t("pages.info.tournament_rules.title") }}
                </NuxtLink>
              </template>
            </i18n-t>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.prizes_awards.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.prizes_awards.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.prizes_awards.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.prizes_awards.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Content You Provide + Competitive & Historical Records: paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.content_you_provide.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.content_you_provide.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.content_you_provide.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.content_you_provide.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.competitive_history.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.competitive_history.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.competitive_history.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.competitive_history.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Service Availability + Changes to DEAFCS and These Terms: both short, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.service_availability.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.service_availability.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.service_availability.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.terms_of_service.sections.changes.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.terms_of_service.sections.changes.body_1") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Contact: short, compact closing section. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.terms_of_service.sections.contact.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.terms_of_service.sections.contact.body_1"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/contact" :class="linkClasses">
                {{ $t("pages.info.contact.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
