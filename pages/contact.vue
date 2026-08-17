<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  LifeBuoy,
  MessageCircle,
  Bug,
  Lightbulb,
  Trophy,
  UserCog,
  ShieldCheck,
  Handshake,
} from "lucide-vue-next";
import InfoPage from "~/components/info/InfoPage.vue";
import ContactCard from "~/components/info/ContactCard.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.contact.title"),
});
</script>

<template>
  <InfoPage
    :title="$t('pages.info.contact.title')"
    :intro="$t('pages.info.contact.intro')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.contact.live_match.title") }}
      </span>
      <ContactCard
        :icon="LifeBuoy"
        :title="$t('pages.info.contact.live_match.title')"
        :description="$t('pages.info.contact.live_match.description')"
        highlight
      >
        <ol
          class="flex list-decimal flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/90"
        >
          <li>{{ $t("pages.info.contact.live_match.step_1") }}</li>
          <li>{{ $t("pages.info.contact.live_match.step_2") }}</li>
          <li>{{ $t("pages.info.contact.live_match.step_3") }}</li>
        </ol>
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ $t("pages.info.contact.live_match.note") }}
        </p>
      </ContactCard>
    </div>

    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.contact.other_ways") }}
      </span>
      <div class="grid gap-4 sm:grid-cols-2">
        <ContactCard
          :icon="MessageCircle"
          :title="$t('pages.info.contact.general_support.title')"
          :description="$t('pages.info.contact.general_support.description')"
          :status="$t('pages.info.contact.general_support.status')"
        />

        <ContactCard
          :icon="Bug"
          :title="$t('pages.info.contact.bug_reports.title')"
          :description="$t('pages.info.contact.bug_reports.description')"
          :status="$t('pages.info.contact.bug_reports.status')"
        />

        <ContactCard
          :icon="Lightbulb"
          :title="$t('pages.info.contact.suggestions.title')"
          :description="$t('pages.info.contact.suggestions.description')"
          :status="$t('pages.info.contact.suggestions.status')"
        />

        <ContactCard
          :icon="Trophy"
          :title="$t('pages.info.contact.organizer_access.title')"
          :description="$t('pages.info.contact.organizer_access.description')"
          :status="$t('pages.info.contact.organizer_access.status')"
        />

        <ContactCard
          :icon="UserCog"
          :title="$t('pages.info.contact.account_data.title')"
        >
          <i18n-t
            keypath="pages.info.contact.account_data.description"
            tag="p"
            scope="global"
            class="text-sm leading-relaxed text-foreground/90"
          >
            <template #link>
              <NuxtLink
                to="/account-data"
                class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
              >
                {{ $t("pages.info.account_data.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </ContactCard>

        <ContactCard
          :icon="ShieldCheck"
          :title="$t('pages.info.contact.privacy.title')"
        >
          <i18n-t
            keypath="pages.info.contact.privacy.description"
            tag="p"
            scope="global"
            class="text-sm leading-relaxed text-foreground/90"
          >
            <template #link>
              <NuxtLink
                to="/privacy-policy"
                class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
              >
                {{ $t("pages.info.privacy_policy.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
        </ContactCard>

        <ContactCard
          :icon="Handshake"
          :title="$t('pages.info.contact.partnerships.title')"
          :description="$t('pages.info.contact.partnerships.description')"
          :status="$t('pages.info.contact.partnerships.status')"
        />
      </div>
    </div>
  </div>
</template>
