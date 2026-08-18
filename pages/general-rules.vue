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
  title: () => t("pages.info.general_rules.title"),
});

const listClasses =
  "flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/90";
const bodyClasses = "text-sm leading-relaxed text-foreground/90";
const linkClasses =
  "font-semibold text-[hsl(var(--tac-amber))] hover:underline";
</script>

<template>
  <InfoPage
    :title="$t('pages.info.general_rules.title')"
    :intro="$t('pages.info.general_rules.intro')"
    :last-updated="$t('pages.info.general_rules.last_updated_date')"
  >
    <i18n-t
      keypath="pages.info.general_rules.intro_2"
      tag="p"
      scope="global"
      :class="bodyClasses"
    >
      <template #link>
        <NuxtLink to="/matchmaking-rules" :class="linkClasses">
          {{ $t("pages.info.matchmaking_rules.title") }}
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
    <!-- Respect & Conduct: notably longer than every adjacent section, kept full width to avoid a tall/short mismatch. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.general_rules.sections.respect.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.respect.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.general_rules.sections.respect.item_1") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.respect.item_2") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.respect.item_3") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.respect.item_4") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.respect.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.respect.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.respect.body_4") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Cheating + VAC/Game Bans: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.general_rules.sections.cheating.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.cheating.body_1") }}
            </p>
            <ul :class="listClasses">
              <li>{{ $t("pages.info.general_rules.sections.cheating.item_1") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.cheating.item_2") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.cheating.item_3") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.cheating.item_4") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.cheating.item_5") }}</li>
            </ul>
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.cheating.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.general_rules.sections.vac_bans.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.vac_bans.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.vac_bans.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.vac_bans.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Exploits & Bugs: measured too uneven paired with Accounts (text reflow in a
         narrow column leaves a large empty gap), so kept full width instead. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.general_rules.sections.exploits.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.exploits.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_1") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_2") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_3") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_4") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_5") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_6") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_7") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.exploits.item_8") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.exploits.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Accounts, Steam ID & Identity: long and high-importance, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.general_rules.sections.accounts.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.accounts.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.accounts.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.accounts.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.accounts.body_4") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.accounts.body_5") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Player Verification: long and high-importance, full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.general_rules.sections.verification.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.verification.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.verification.body_2") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.general_rules.sections.verification.item_1") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.verification.item_2") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.verification.item_3") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.verification.item_4") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.verification.item_5") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.verification.item_6") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.verification.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.verification.body_4") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Competitive Integrity + Community & Platform Abuse: similar-length prohibition lists, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.general_rules.sections.competitive_integrity.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.competitive_integrity.body_1") }}
            </p>
            <ul :class="listClasses">
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_1") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_2") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_3") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_4") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_5") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_6") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_7") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.competitive_integrity.item_8") }}</li>
            </ul>
            <i18n-t
              keypath="pages.info.general_rules.sections.competitive_integrity.closing"
              tag="p"
              scope="global"
              class="text-xs leading-relaxed text-muted-foreground"
            >
              <template #link>
                <NuxtLink to="/matchmaking-rules" :class="linkClasses">
                  {{ $t("pages.info.matchmaking_rules.title") }}
                </NuxtLink>
              </template>
              <template #link2>
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
          {{ $t("pages.info.general_rules.sections.community_abuse.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.community_abuse.body_1") }}
            </p>
            <ul :class="listClasses">
              <li>{{ $t("pages.info.general_rules.sections.community_abuse.item_1") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.community_abuse.item_2") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.community_abuse.item_3") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.community_abuse.item_4") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.community_abuse.item_5") }}</li>
              <li>{{ $t("pages.info.general_rules.sections.community_abuse.item_6") }}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Staff & Organizer Cooperation + Reports & Evidence: both short/medium prose, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.general_rules.sections.staff_cooperation.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.staff_cooperation.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.staff_cooperation.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.general_rules.sections.reports_evidence.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.reports_evidence.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.general_rules.sections.reports_evidence.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Enforcement & Penalties: longer, kept full width so its lists have room. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.general_rules.sections.enforcement.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.enforcement.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.general_rules.sections.enforcement.item_1") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.enforcement.item_2") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.enforcement.item_3") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.enforcement.item_4") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.enforcement.item_5") }}</li>
            <li>{{ $t("pages.info.general_rules.sections.enforcement.item_6") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.enforcement.body_2") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.enforcement.body_3") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Rule Changes: short, compact closing section. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.general_rules.sections.rule_changes.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.general_rules.sections.rule_changes.body_1") }}
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
