<script setup lang="ts">
import { useI18n } from "vue-i18n";
import InfoPage from "~/components/info/InfoPage.vue";
import { Badge } from "~/components/ui/badge";

const { t } = useI18n();

useHead({
  title: () => t("pages.info.forum.title"),
});
</script>

<template>
  <InfoPage
    :title="$t('pages.info.forum.title')"
    :intro="$t('pages.info.forum.intro')"
  >
    <Badge variant="secondary" class="w-fit">{{
      $t("pages.coming_soon")
    }}</Badge>
  </InfoPage>
</template>
