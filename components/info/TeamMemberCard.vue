<script setup lang="ts">
import { computed } from "vue";
import { UserRound } from "lucide-vue-next";
import { NuxtLink } from "#components";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Card, CardContent } from "~/components/ui/card";

// Placeholder-only prototype: no photo, bio, or video wiring yet. The
// isolated avatar slot + group hover/focus treatment are here so a real
// photo, a play/sign icon, and click-to-play video can be dropped in later
// without touching the rest of the card.
const props = defineProps<{
  nickname: string;
  role: string;
  bio: string;
  // Steam ID of the member's DEAFCS player profile. Omit/null when the
  // profile target isn't confirmed yet — the card renders as a static,
  // non-interactive block in that case rather than guessing a link.
  profileSteamId?: string | null;
  viewProfileLabel?: string;
}>();

const profilePath = computed(() =>
  props.profileSteamId
    ? { name: "players-id", params: { id: props.profileSteamId } }
    : null,
);
</script>

<template>
  <component
    :is="profilePath ? NuxtLink : 'div'"
    v-bind="profilePath ? { to: profilePath, ariaLabel: viewProfileLabel } : {}"
    class="group block rounded-xl"
    :class="
      profilePath &&
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-background'
    "
  >
    <Card
      class="overflow-hidden bg-card/20 transition-colors duration-150"
      :class="
        profilePath &&
        'group-hover:border-[hsl(var(--tac-amber)/0.45)] group-focus-visible:border-[hsl(var(--tac-amber)/0.45)]'
      "
    >
      <CardContent
        class="flex flex-col items-center gap-3 p-5 text-center sm:p-6"
      >
        <Avatar size="base" class="border border-border/60 bg-muted/40">
          <AvatarFallback>
            <UserRound class="h-7 w-7 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        <div class="flex flex-col gap-1">
          <span
            class="font-sans text-sm font-bold uppercase tracking-[0.08em] text-foreground"
          >
            {{ nickname }}
          </span>
          <span
            class="text-xs uppercase tracking-[0.1em] text-muted-foreground"
          >
            {{ role }}
          </span>
        </div>

        <p class="text-xs leading-relaxed text-muted-foreground/80">
          {{ bio }}
        </p>
      </CardContent>
    </Card>
  </component>
</template>
