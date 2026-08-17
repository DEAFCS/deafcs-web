<script setup lang="ts">
import { useI18n } from "vue-i18n";
import InfoPage from "~/components/info/InfoPage.vue";

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
</template>
