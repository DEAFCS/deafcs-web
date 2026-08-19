<script setup lang="ts">
import { useI18n } from "vue-i18n";
import InfoPage from "~/components/info/InfoPage.vue";
import InlineToken from "~/components/info/InlineToken.vue";
import { Card, CardContent } from "~/components/ui/card";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.tournament_rules.title"),
});

const listClasses =
  "flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/90";
const bodyClasses = "text-sm leading-relaxed text-foreground/90";
const linkClasses =
  "font-semibold text-[hsl(var(--tac-amber))] hover:underline";
</script>

<template>
  <InfoPage
    :title="$t('pages.info.tournament_rules.title')"
    :intro="$t('pages.info.tournament_rules.intro')"
    :last-updated="$t('pages.info.tournament_rules.last_updated_date')"
  >
    <i18n-t
      keypath="pages.info.tournament_rules.intro_2"
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
    </i18n-t>
  </InfoPage>

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <!-- Eligibility & Registration: standalone opener. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.tournament_rules.sections.eligibility.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.tournament_rules.sections.eligibility.body_1"
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
            {{ $t("pages.info.tournament_rules.sections.eligibility.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Teams & Rosters + Substitutes: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.teams_rosters.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.teams_rosters.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.teams_rosters.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.substitutes.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.substitutes.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.substitutes.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Match Scheduling & Being Ready: standalone, sets up the Check-In section below. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.tournament_rules.sections.scheduling.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.scheduling.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.scheduling.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Match Check-In: the richest section, kept full width. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.tournament_rules.sections.check_in.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.check_in.body_1") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.check_in.body_2") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.tournament_rules.sections.check_in.item_1") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.check_in.item_2") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.check_in.item_3") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.check_in.body_3") }}
          </p>
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.check_in.body_4") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Map Pool & Veto + Server Joining & Connection: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.map_veto.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <i18n-t
              keypath="pages.info.tournament_rules.sections.map_veto.body_1"
              tag="p"
              scope="global"
              :class="bodyClasses"
            >
              <template #link>
                <NuxtLink to="/matchmaking-rules" :class="linkClasses">
                  {{ $t("pages.info.matchmaking_rules.title") }}
                </NuxtLink>
              </template>
            </i18n-t>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.map_veto.body_2") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.map_veto.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.server_connection.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.server_connection.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.server_connection.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Match Cancellation & No-Shows + Technical Pauses & Timeouts: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.cancellation.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.cancellation.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.cancellation.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.pauses_timeouts.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <i18n-t
              keypath="pages.info.tournament_rules.sections.pauses_timeouts.body_1"
              tag="p"
              scope="global"
              :class="bodyClasses"
            >
              <template #tac>
                <InlineToken>.tac</InlineToken>
              </template>
            </i18n-t>
            <i18n-t
              keypath="pages.info.tournament_rules.sections.pauses_timeouts.body_2"
              tag="p"
              scope="global"
              :class="bodyClasses"
            >
              <template #pause>
                <InlineToken>.pause</InlineToken>
              </template>
            </i18n-t>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.pauses_timeouts.body_3") }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Webcam Requirement + Fair Play, Cheating & Account Restrictions: both short, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.webcam.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.webcam.body_1") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.fair_play.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <i18n-t
              keypath="pages.info.tournament_rules.sections.fair_play.body_1"
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
            <i18n-t
              keypath="pages.info.tournament_rules.sections.fair_play.body_2"
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
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Organizer/Admin Rulings & Disputes + Results, Forfeits & Penalties: comparable content length, paired for balance. -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.disputes.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.disputes.body_1") }}
            </p>
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.disputes.body_2") }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="flex flex-col gap-3">
        <span :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" />
          {{ $t("pages.info.tournament_rules.sections.results_forfeits.title") }}
        </span>
        <Card class="h-full bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <p :class="bodyClasses">
              {{ $t("pages.info.tournament_rules.sections.results_forfeits.body_1") }}
            </p>
            <i18n-t
              keypath="pages.info.tournament_rules.sections.results_forfeits.body_2"
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
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Awards: standalone, placed right after Results, Forfeits & Penalties. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.tournament_rules.sections.awards.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.awards.body_1") }}
          </p>
          <i18n-t
            keypath="pages.info.tournament_rules.sections.awards.body_2"
            tag="p"
            scope="global"
            :class="bodyClasses"
          >
            <template #link>
              <NuxtLink to="/teams" :class="linkClasses">
                {{ $t("pages.teams.title") }}
              </NuxtLink>
            </template>
          </i18n-t>
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.awards.body_3") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Check This Tournament's Settings: closing section, distinguishes Tournament Rules from Tournament Settings. -->
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.tournament_rules.sections.settings_note.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.settings_note.body_1") }}
          </p>
          <ul :class="listClasses">
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_1") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_2") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_3") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_4") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_5") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_6") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_7") }}</li>
            <li>{{ $t("pages.info.tournament_rules.sections.settings_note.item_8") }}</li>
          </ul>
          <p :class="bodyClasses">
            {{ $t("pages.info.tournament_rules.sections.settings_note.body_2") }}
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
