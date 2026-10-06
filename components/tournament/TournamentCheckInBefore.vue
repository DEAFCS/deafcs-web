<!-- Ported from 5Stack WEB b4b83f23c8b1cb8851d421eee76498b766b5d899 TournamentCheckInPanel.vue; MIT Copyright (c) 2025 5Stack.gg; see LICENSE. -->
<script setup lang="ts">
import { Button } from "~/components/ui/button";
import TournamentTime from "~/components/tournament/TournamentTime.vue";
import { tacticalCtaButtonClasses } from "~/utilities/tacticalClasses";
import type { TournamentTimeInput } from "~/utilities/tournamentTime";

withDefaults(defineProps<{
  opensAt: TournamentTimeInput;
  closesAt: TournamentTimeInput;
  canRegister?: boolean;
}>(), { canRegister: true });
const emit = defineEmits<{ (e: "register"): void }>();
</script>

<template>
  <div class="rounded-md border border-[hsl(var(--tac-amber)_/_0.45)] bg-[hsl(var(--tac-amber)_/_0.08)] px-4 py-3 text-sm leading-relaxed text-muted-foreground">
    <strong class="text-foreground">{{ $t("tournament.check_in.required_title") }}</strong>{{ " " }}
    <i18n-t keypath="tournament.check_in.required_window" tag="span">
      <template #opens><TournamentTime :value="opensAt" display="time" /></template>
      <template #closes><TournamentTime :value="closesAt" display="time" /></template>
    </i18n-t>
  </div>
  <div v-if="canRegister" class="mt-4 flex flex-wrap items-center justify-between gap-5 max-sm:flex-col max-sm:items-start">
    <div class="min-w-0">
      <h3 class="m-0 font-sans text-[1.05rem] font-bold tracking-[0.01em] text-foreground">{{ $t("tournament.check_in.register_heading") }}</h3>
      <p class="mt-1 text-[0.8rem] text-muted-foreground">{{ $t("tournament.check_in.register_hint") }}</p>
    </div>
    <Button :class="[tacticalCtaButtonClasses, 'shrink-0 max-sm:w-full']" @click="emit('register')">{{ $t("tournament.check_in.register_cta") }}</Button>
  </div>
</template>
