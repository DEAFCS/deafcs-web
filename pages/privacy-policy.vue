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
  title: () => t("pages.info.privacy_policy.title"),
});

const listClasses =
  "flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/90";
const bodyClasses = "text-sm leading-relaxed text-foreground/90";
const linkClasses =
  "font-semibold text-[hsl(var(--tac-amber))] hover:underline";
</script>

<template>
  <InfoPage
    :title="$t('pages.info.privacy_policy.title')"
    :intro="$t('pages.info.privacy_policy.intro')"
    :last-updated="$t('pages.info.privacy_policy.last_updated_date')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <!-- Who We Are: short, opening section. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.who_we_are.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.who_we_are.body_1") }}
          </p>
          <i18n-t
            keypath="pages.info.privacy_policy.sections.who_we_are.body_2"
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

    <!-- Information We Collect: long list, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.information_we_collect.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.information_we_collect.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.privacy_policy.sections.information_we_collect.item_1") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.information_we_collect.item_2") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.information_we_collect.item_3") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.information_we_collect.item_4") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.information_we_collect.item_5") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.information_we_collect.item_6") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.information_we_collect.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- How We Use Information: long list, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.how_we_use_information.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.how_we_use_information.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_1") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_2") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_3") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_4") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_5") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_6") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_7") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_8") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.how_we_use_information.item_9") }}</li>
          </ul>
        </CardContent>
      </Card>
    </div>

    <!-- Player Verification: long and high-importance, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.verification.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.verification.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.verification.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.verification.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.verification.body_4") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.verification.body_5") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Competitive & Historical Records: strong section, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.competitive_history.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.competitive_history.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.competitive_history.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.competitive_history.body_3") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Public Information: short, kept full width and in numeric order
         between Competitive & Historical Records (5) and Third-Party
         Services (7) -- do not pair this with Security (10), which reads
         out of order this early in the page. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.public_information.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.public_information.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.public_information.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Third-Party Services: long list, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.third_party_services.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.third_party_services.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_1") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_2") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_3") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_4") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_5") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_6") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.third_party_services.item_7") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.third_party_services.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Data Storage & Retention: full width, careful/legally-flagged wording. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.data_retention.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.data_retention.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.data_retention.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.data_retention.body_3") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Your Choices & Requests: full width, has a list plus two closing links. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.your_choices.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.your_choices.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.privacy_policy.sections.your_choices.item_1") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.your_choices.item_2") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.your_choices.item_3") }}</li>
            <li>{{ $t("pages.info.privacy_policy.sections.your_choices.item_4") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.privacy_policy.sections.your_choices.body_2") }}
          </p>
          <i18n-t
            keypath="pages.info.privacy_policy.sections.your_choices.body_3"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/contact" :class="linkClasses">
                {{ $t("pages.info.contact.title") }}
              </NuxtLink>
            </template>
            <template #link2>
              <NuxtLink to="/account-data" :class="linkClasses">
                {{ $t("pages.info.account_data.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </CardContent>
      </Card>
    </div>

    <!-- Security + Changes to This Policy: both short, numerically adjacent (10, 11), paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.privacy_policy.sections.security.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.privacy_policy.sections.security.body_1") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.privacy_policy.sections.changes.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.privacy_policy.sections.changes.body_1") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Contact: full width, final section. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.privacy_policy.sections.contact.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.privacy_policy.sections.contact.body_1"
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
