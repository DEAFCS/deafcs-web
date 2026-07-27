<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "~/stores/AuthStore";
import LoadingScreen from "~/components/LoadingScreen.vue";

definePageMeta({
  layout: "default",
});

const authStore = useAuthStore();

if (!authStore.hasCheckedSession) {
  void authStore.getMe();
}

const isLoggedIn = computed(
  () => authStore.hasCheckedSession && !!authStore.me?.steam_id,
);
</script>

<template>
  <LoadingScreen
    v-if="!authStore.hasCheckedSession"
    class="min-h-[60vh]"
  />

  <section
    v-else
    class="relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card/40 px-6 py-16 text-center [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_12px,hsl(var(--muted-foreground)/0.025)_12px,hsl(var(--muted-foreground)/0.025)_13px)]"
  >
    <div
      class="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-[hsl(var(--tac-amber)/0.7)]"
      aria-hidden="true"
    ></div>
    <div
      class="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-[hsl(var(--tac-amber)/0.7)]"
      aria-hidden="true"
    ></div>

    <div class="relative max-w-xl">
      <div
        class="mb-4 inline-flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--tac-amber))]"
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--tac-amber))]"
          aria-hidden="true"
        ></span>
        Temporary homepage shell
      </div>

      <template v-if="isLoggedIn">
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
          Logged-in dashboard placeholder
        </h1>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          Your authenticated DEAFCS homepage will be built here in the next
          implementation steps.
        </p>
      </template>

      <template v-else>
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
          Logged-out homepage placeholder
        </h1>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          The public DEAFCS homepage will be built here in the next
          implementation steps.
        </p>
      </template>
    </div>
  </section>
</template>
