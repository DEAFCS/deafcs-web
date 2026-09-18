<script setup lang="ts">
import { computed, onMounted } from "vue";
import { ShieldAlert } from "lucide-vue-next";
import { useWebsiteRestrictionStore } from "~/stores/WebsiteRestrictionStore";

const store = useWebsiteRestrictionStore();
onMounted(() => store.start());

const expiration = computed(() =>
  store.status.expiresAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(store.status.expiresAt))
    : null,
);

const appealHref = computed(
  () =>
    `mailto:info@deafcs.net?subject=${encodeURIComponent("[DEAFCS] Account restriction appeal")}`,
);
</script>

<template>
  <div
    v-if="store.isRestricted"
    role="alert"
    class="mx-auto my-3 w-[min(72rem,calc(100%-2rem))] border border-destructive/50 bg-destructive/10 p-4 shadow-sm"
  >
    <div class="flex items-start gap-3">
      <ShieldAlert class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div class="space-y-2">
        <h2 class="font-mono text-sm font-bold uppercase tracking-[0.14em] text-destructive">
          Account restricted
        </h2>
        <p class="text-sm">
          Your DEAFCS account is restricted to read-only access.
        </p>
        <p class="text-sm text-muted-foreground">
          You cannot participate or submit requests while this restriction is active.
        </p>
        <dl class="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3" v-if="store.status.reason || store.status.permanent || expiration">
          <dt v-if="store.status.reason" class="font-medium">Reason</dt>
          <dd v-if="store.status.reason">{{ store.status.reason }}</dd>
          <dt class="font-medium">Expiration</dt>
          <dd>{{ store.status.permanent ? "Permanent" : expiration }}</dd>
        </dl>
        <p class="text-sm">
          If you wish to appeal, please contact us by email:
          <a :href="appealHref" class="font-medium text-primary underline underline-offset-4">
            info@deafcs.net
          </a>
        </p>
      </div>
    </div>
  </div>
</template>
