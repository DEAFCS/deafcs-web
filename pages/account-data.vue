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
  title: () => t("pages.info.account_data.title"),
});

const listClasses =
  "flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/90";
const bodyClasses = "text-sm leading-relaxed text-foreground/90";
const closingClasses = "text-xs leading-relaxed text-muted-foreground";
const linkClasses =
  "font-semibold text-[hsl(var(--tac-amber))] hover:underline";
</script>

<template>
  <InfoPage
    :title="$t('pages.info.account_data.title')"
    :intro="$t('pages.info.account_data.intro')"
    :last-updated="$t('pages.info.account_data.last_updated_date')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <!-- Your DEAFCS Account + Your Steam Identity: both short, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.account_data.sections.your_account.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.account_data.sections.your_account.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.account_data.sections.your_account.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.account_data.sections.steam_identity.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.account_data.sections.steam_identity.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.account_data.sections.steam_identity.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Profile Data You Control: has a list, kept full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.account_data.sections.profile_data.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.profile_data.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.account_data.sections.profile_data.item_1") }}</li>
            <li>{{ $t("pages.info.account_data.sections.profile_data.item_2") }}</li>
            <li>{{ $t("pages.info.account_data.sections.profile_data.item_3") }}</li>
            <li>{{ $t("pages.info.account_data.sections.profile_data.item_4") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.profile_data.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Player Verification: long and high-importance, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.account_data.sections.verification.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.verification.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.verification.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.verification.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.verification.body_4") }}
          </p>
          <i18n-t
            keypath="pages.info.account_data.sections.verification.closing"
            tag="p"
            scope="global"
            :class="closingClasses"
          >
            <template #link>
              <NuxtLink to="/general-rules" :class="linkClasses">
                {{ $t("pages.info.general_rules.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </CardContent>
      </Card>
    </div>

    <!-- Competitive History: the strongest section on the page, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.account_data.sections.competitive_history.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.competitive_history.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_1") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_2") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_3") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_4") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_5") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_6") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_7") }}</li>
            <li>{{ $t("pages.info.account_data.sections.competitive_history.item_8") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.competitive_history.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.account_data.sections.competitive_history.body_3") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Account Access & Restrictions + Returning to DEAFCS: both short, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.account_data.sections.access_restrictions.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <i18n-t
              keypath="pages.info.account_data.sections.access_restrictions.body_1"
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
              {{ $t("pages.info.account_data.sections.access_restrictions.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.account_data.sections.returning.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.account_data.sections.returning.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.account_data.sections.returning.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Data & Privacy Requests: short, compact closing section. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.account_data.sections.data_requests.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.account_data.sections.data_requests.body_1"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/contact" :class="linkClasses">
                contact DEAFCS
              </NuxtLink>
            </template>
          </i18n-t>
          <i18n-t
            keypath="pages.info.account_data.sections.data_requests.body_2"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link2>
              <NuxtLink to="/privacy-policy" :class="linkClasses">
                {{ $t("pages.info.privacy_policy.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
