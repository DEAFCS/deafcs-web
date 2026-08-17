<script setup lang="ts">
import { useI18n } from "vue-i18n";
import InfoPage from "~/components/info/InfoPage.vue";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.tournament_rules.title"),
});
</script>

<template>
  <InfoPage
    :title="$t('pages.info.tournament_rules.title')"
    :intro="$t('pages.info.tournament_rules.intro')"
  />
</template>
