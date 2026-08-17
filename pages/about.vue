<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink } from "lucide-vue-next";
import InfoPage from "~/components/info/InfoPage.vue";
import TeamMemberCard from "~/components/info/TeamMemberCard.vue";
import { Card, CardContent } from "~/components/ui/card";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.about.title"),
});

// Confirmed DEAFCS player-profile steam_ids for the /players/:id route.
const teamMembers = computed(() => [
  {
    key: "tricon",
    nickname: t("pages.info.about.team.members.tricon.nickname"),
    role: t("pages.info.about.team.members.tricon.role"),
    bio: t("pages.info.about.team.members.tricon.bio"),
    steamId: "76561198029293543",
  },
  {
    key: "theft",
    nickname: t("pages.info.about.team.members.theft.nickname"),
    role: t("pages.info.about.team.members.theft.role"),
    bio: t("pages.info.about.team.members.theft.bio"),
    steamId: "76561198197507737",
  },
  {
    key: "m0c1n",
    nickname: t("pages.info.about.team.members.m0c1n.nickname"),
    role: t("pages.info.about.team.members.m0c1n.role"),
    bio: t("pages.info.about.team.members.m0c1n.bio"),
    steamId: "76561199096084249",
  },
]);
</script>

<template>
  <InfoPage
    :title="$t('pages.info.about.title')"
    :intro="$t('pages.info.about.intro')"
  >
    <p class="text-sm leading-relaxed text-foreground/90">
      {{ $t("pages.info.about.intro_2") }}
    </p>
    <p class="text-sm leading-relaxed text-foreground/90">
      {{ $t("pages.info.about.intro_3") }}
    </p>
    <p class="text-sm leading-relaxed text-foreground/90">
      {{ $t("pages.info.about.intro_4") }}
    </p>
    <p class="text-sm leading-relaxed text-foreground/90">
      {{ $t("pages.info.about.intro_5") }}
    </p>
  </InfoPage>

  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-12">
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.about.mission.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <p class="text-sm leading-relaxed text-foreground/90">
            {{ $t("pages.info.about.mission.intro") }}
          </p>
          <p class="text-sm leading-relaxed text-foreground/90">
            {{ $t("pages.info.about.mission.body") }}
          </p>
          <p class="text-sm leading-relaxed text-foreground/90">
            {{ $t("pages.info.about.mission.closing") }}
          </p>
        </CardContent>
      </Card>
    </div>

    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.about.team.title") }}
      </span>
      <p class="text-sm leading-relaxed text-foreground/90">
        {{ $t("pages.info.about.team.intro") }}
      </p>
      <div class="grid gap-4 sm:grid-cols-3">
        <TeamMemberCard
          v-for="member in teamMembers"
          :key="member.key"
          :nickname="member.nickname"
          :role="member.role"
          :bio="member.bio"
          :profile-steam-id="member.steamId"
          :view-profile-label="
            $t('pages.info.about.team.view_profile', { name: member.nickname })
          "
        />
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.about.tdil.title") }}
      </span>
      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <i18n-t
            keypath="pages.info.about.tdil.intro"
            tag="p"
            scope="global"
            class="text-sm leading-relaxed text-foreground/90"
          >
            <template #link>
              <a
                href="https://www.tdil.no/"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 font-semibold text-[hsl(var(--tac-amber))] hover:underline"
              >
                {{ $t("pages.info.about.tdil.link_label") }}
                <ExternalLink class="h-3 w-3" />
              </a>
            </template>
          </i18n-t>
          <p class="text-sm leading-relaxed text-foreground/90">
            {{ $t("pages.info.about.tdil.body") }}
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
