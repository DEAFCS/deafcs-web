<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useInAppBack } from "~/composables/useInAppBack";

// Phone and installed-app Back: shown only when there is a DEAFCS page to go
// back to (see useInAppBack).
const { visible, goBack } = useInAppBack();
</script>

<template>
  <Button
    v-if="visible"
    variant="ghost"
    size="icon"
    class="h-10 w-10 shrink-0 text-topnav-foreground"
    :aria-label="$t('layouts.top_nav.back')"
    :title="$t('layouts.top_nav.back')"
    data-testid="mobile-back"
    @click="goBack"
  >
    <ArrowLeft class="h-5 w-5" aria-hidden="true" />
  </Button>
</template>
