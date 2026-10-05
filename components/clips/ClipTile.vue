<script setup lang="ts">
// Presentation adapted from current 5Stack ClipTile.vue (ea7f305).
// MIT License, Copyright (c) 2025 5Stack.gg — see LICENSE.
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNuxtApp } from "#app";
import { ArrowUpRight, Check, Eye, Film, Globe, Lock, Play, Share2, Trophy, Users } from "lucide-vue-next";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Spinner } from "~/components/ui/spinner";
import { useAuthStore } from "~/stores/AuthStore";
import { useClipModal } from "~/composables/useClipModal";
import { useClipShare } from "~/composables/useClipShare";
import { generateMutation } from "~/graphql/graphqlGen";
import { clipDisplayTitle, clipRoundKills, formatClipDuration } from "~/utilities/clipDisplay";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import cleanMapName from "~/utilities/cleanMapName";
import type { Clip } from "~/types/clip";
import TimeAgo from "~/components/TimeAgo.vue";

const props = withDefaults(defineProps<{
  clip: Clip; variant?: "tile" | "hero"; fill?: boolean; tag?: string;
  queue?: Clip[]; queueScope?: string; group?: Clip[];
}>(), { variant: "tile" });
const emit = defineEmits<{ "visibility-changed": [id: string, visibility: string] }>();
const { t } = useI18n();
const auth = useAuthStore();
const nuxtApp = useNuxtApp();
const { playClips } = useClipModal();
const { copiedClipId, shareClip } = useClipShare();
const hero = computed(() => props.variant === "hero");
const player = computed(() => props.clip.target);
const title = computed(() => clipDisplayTitle(props.clip.title, player.value?.name) ?? t("clips.untitled_clip"));
const duration = computed(() => formatClipDuration(props.clip.duration_ms));
const thumb = computed(() => (props.group ?? [props.clip]).find(c => c.thumbnail_download_url)?.thumbnail_download_url ?? props.clip.match_map?.map?.poster);
const thumbLoaded = ref(false);
watch(thumb, () => { thumbLoaded.value = false; });
async function onThumbLoad(event: Event) {
  const img = event.target as HTMLImageElement;
  const source = thumb.value;
  try { await img.decode?.(); } catch { /* loaded image still usable */ }
  if (source === thumb.value) thumbLoaded.value = true;
}
const avatar = computed(() => resolveAvatarUrl(player.value?.avatar_url ?? null, useRuntimeConfig().public.apiDomain as string));
const mapLabel = computed(() => {
  const map = props.clip.match_map?.map;
  return map ? map.label || cleanMapName(map.name) : null;
});
const roundKills = computed(() => clipRoundKills(props.clip));
const killLabel = computed(() => {
  if (roundKills.value === 5) return "ACE";
  if (roundKills.value != null && roundKills.value <= 5) return `${roundKills.value}K`;
  return props.clip.kills_count ? t("clips.kills_in_clip", { count: props.clip.kills_count }, props.clip.kills_count) : null;
});
const views = computed(() => props.group?.reduce((sum, clip) => sum + (clip.views_count ?? 0), 0) ?? props.clip.views_count ?? 0);
const match = computed(() => props.clip.match_map?.match);
const playedMaps = computed(() => {
  const maps = match.value?.match_maps?.filter(m => (m.lineup_1_score ?? 0) > 0 || (m.lineup_2_score ?? 0) > 0) ?? [];
  return maps.length ? [...maps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [props.clip.match_map].filter(Boolean);
});
const mapScores = computed(() => playedMaps.value.map(m => `${m?.map?.label || (m?.map?.name ? cleanMapName(m.map.name) : "")} ${m?.lineup_1_score ?? 0}–${m?.lineup_2_score ?? 0}`).join(" · "));
function onPlay(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  playClips(props.queue ?? props.group ?? [props.clip], props.clip.id, props.queueScope ?? null);
}
const canEditVisibility = computed(() => auth.isAdmin || (!!auth.me?.steam_id && String(auth.me.steam_id) === String(props.clip.user_steam_id)));
const visibility = ref(props.clip.visibility);
watch(() => [props.clip.id, props.clip.visibility], () => { visibility.value = props.clip.visibility; });
const visibilityIcon = computed(() => visibility.value === "public" ? Globe : visibility.value === "private" ? Lock : Users);
const visOpen = ref(false);
const saving = ref(false);
const options = computed(() => ["public", "private"].map(value => ({ value, label: t(`clips.visibility.${value}`), hint: t(`clips.visibility.${value}_hint`) })));
async function setVisibility(value: string) {
  if (!canEditVisibility.value || saving.value || visibility.value === value) return;
  const id = props.clip.id;
  saving.value = true;
  try {
    const result = await nuxtApp.$apollo.defaultClient.mutate({ mutation: generateMutation({ updateClip: [{ clip_id: id, visibility: value }, { success: true }] } as any) });
    if (result.data?.updateClip?.success === false) return;
    if (props.clip.id === id) { visibility.value = value; visOpen.value = false; }
    emit("visibility-changed", id, value);
  } catch (error) { console.error("[clip-tile] visibility change failed:", error); }
  finally { saving.value = false; }
}
</script>

<template>
  <article class="clip-tile group/clip relative isolate min-w-0 overflow-hidden rounded-xl border border-border/60 bg-black text-white transition-colors hover:border-[hsl(var(--tac-amber)/0.6)] focus-within:border-[hsl(var(--tac-amber)/0.6)]"
    :class="[fill ? 'h-full w-full' : group && group.length > 1 ? 'aspect-[4/3] clip-tile-group' : 'aspect-[16/11]', hero ? 'clip-tile-hero' : '']" data-testid="clip-tile">
    <NuxtImg v-if="thumb" :src="thumb" alt="" loading="lazy" decoding="async"
      class="absolute inset-0 -z-20 h-full w-full object-cover transition-[transform,opacity] duration-500 motion-safe:group-hover/clip:scale-[1.03] motion-reduce:transition-none"
      :class="thumbLoaded ? 'opacity-100' : 'opacity-0'" @load="onThumbLoad" />
    <Film v-else class="absolute left-1/2 top-1/3 -z-20 h-8 w-8 -translate-x-1/2 text-white/30" />
    <div aria-hidden="true" class="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(0_0_0/0.55),transparent_30%,rgb(0_0_0/0.94)_100%)]" />
    <a :href="`/clips/${clip.id}`" class="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--tac-amber))]"
      :aria-label="$t('ui_extras.play_clip', { title })" data-testid="clip-play" @click="onPlay" />
    <span aria-hidden="true" class="pointer-events-none absolute left-1/2 top-[38%] z-10 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/40 text-white backdrop-blur-sm transition-transform group-hover/clip:scale-110 group-focus-within/clip:scale-110 motion-reduce:transition-none" :class="hero ? 'sm:h-16 sm:w-16' : ''" :style="group && group.length > 1 ? { top: '26%' } : undefined">
      <Play class="ml-0.5 h-5 w-5 fill-current" />
    </span>
    <div class="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
      <span v-if="group && match?.options?.best_of" class="inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1"><Trophy v-if="match.is_tournament_match" class="h-3 w-3 text-[hsl(var(--tac-amber))]" :aria-label="$t('ui.tournament_match')" />BO{{ match.options.best_of }}</span>
      <span v-if="killLabel" class="inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[hsl(var(--tac-amber))]" data-testid="clip-kills">
        <span v-if="roundKills != null && roundKills <= 5" class="inline-flex gap-0.5" aria-hidden="true"><i v-for="n in 5" :key="n" class="h-3 w-1 -skew-x-12" :class="n <= roundKills ? 'bg-[hsl(var(--tac-amber))]' : 'bg-white/20'" /></span>
        {{ killLabel }}
      </span>
      <span v-if="duration" class="ml-auto rounded-md bg-black/75 px-2 py-1" data-testid="clip-duration">{{ duration }}</span>
      <span v-if="tag" class="max-w-full rounded-md border border-[hsl(var(--tac-amber)/0.5)] bg-black/75 px-2 py-1 text-[hsl(var(--tac-amber))]" data-testid="clip-tag">{{ tag }}</span>
    </div>
    <div class="pointer-events-none absolute inset-x-3 bottom-3 z-20 grid min-w-0 gap-1.5" :class="hero ? 'sm:inset-x-5 sm:bottom-5 sm:gap-2' : ''">
      <h3 class="line-clamp-2 font-bold leading-tight [overflow-wrap:anywhere]" :class="hero ? 'text-xl sm:text-3xl' : 'text-base'">{{ title }}</h3>
      <NuxtLink v-if="player" :to="`/players/${player.steam_id}`" class="pointer-events-auto flex w-fit max-w-full items-center gap-2 rounded focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))]">
        <Avatar class="h-6 w-6 shrink-0 ring-1 ring-white/20"><AvatarImage v-if="avatar" :src="avatar" alt="" /><AvatarFallback>{{ player.name.slice(0, 1) }}</AvatarFallback></Avatar>
        <span class="truncate text-sm font-semibold">{{ player.name }}</span>
      </NuxtLink>
      <div class="flex flex-wrap items-end justify-between gap-x-2 gap-y-1 text-xs text-white/75">
        <span class="min-w-0 truncate" data-testid="clip-map">{{ mapLabel }}<template v-if="clip.round != null"> · R{{ clip.round }}</template></span>
        <div class="pointer-events-auto ml-auto flex shrink-0 items-center gap-1">
          <span class="mr-1 inline-flex items-center gap-1 tabular-nums" :title="$t('clips.plays_count', { count: views }, views)" data-testid="clip-views"><Eye class="h-3.5 w-3.5" />{{ views }}</span>
          <button type="button" class="clip-action" :aria-label="copiedClipId === clip.id ? $t('clips.link_copied') : $t('clips.share_clip')" data-testid="clip-share" @click="shareClip(clip.id)"><Check v-if="copiedClipId === clip.id" class="h-4 w-4 text-[hsl(var(--tac-amber))]" /><Share2 v-else class="h-4 w-4" /></button>
          <Popover v-if="canEditVisibility" v-model:open="visOpen"><PopoverTrigger class="clip-action" :aria-label="$t('ui_extras.visibility_label', { value: visibility })" data-testid="clip-visibility"><Spinner v-if="saving" class="h-4 w-4" /><component :is="visibilityIcon" v-else class="h-4 w-4" /></PopoverTrigger>
            <PopoverContent class="w-60 p-1" align="end"><button v-for="option in options" :key="option.value" type="button" class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" :disabled="saving" @click="setVisibility(option.value)"><span class="font-semibold">{{ option.label }}</span><span class="block text-xs text-muted-foreground">{{ option.hint }}</span></button></PopoverContent>
          </Popover>
          <component :is="visibilityIcon" v-else-if="visibility !== 'public'" class="h-4 w-4" :aria-label="$t('ui_extras.visibility_label', { value: visibility })" />
          <NuxtLink v-if="group && match?.id" :to="`/matches/${match.id}`" class="clip-action" :aria-label="$t('clips.detail.view_match')" data-testid="clip-open-match"><ArrowUpRight class="h-4 w-4" /></NuxtLink>
        </div>
      </div>
      <p v-if="group && group.length > 1" class="font-mono text-xs text-[hsl(var(--tac-amber))]">{{ group.length }} · {{ $t('common.highlights') }}</p>
      <template v-if="group && group.length > 1">
        <p v-if="match?.lineup_1 && match?.lineup_2" class="truncate text-xs" :title="`${match.lineup_1.name} vs ${match.lineup_2.name}`">
          <span :class="match.winning_lineup_id === match.lineup_1_id ? 'text-[hsl(var(--tac-amber))] font-bold' : ''">{{ match.lineup_1.name }}</span> vs
          <span :class="match.winning_lineup_id === match.lineup_2_id ? 'text-[hsl(var(--tac-amber))] font-bold' : ''">{{ match.lineup_2.name }}</span>
        </p>
        <p v-if="mapScores" class="truncate text-xs text-white/65" :title="mapScores">{{ mapScores }}</p>
      </template>
      <TimeAgo v-if="hero || (group && group.length > 1)" :date="clip.created_at" hide-icon class="text-[10px] text-white/55" />
    </div>
  </article>
</template>

<style scoped>
.clip-tile-group { width: 100%; min-height: 300px; }
.clip-action { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 6px; background: rgb(0 0 0 / 0.4); }
.clip-action:hover { color: hsl(var(--tac-amber)); background: rgb(0 0 0 / 0.8); }
.clip-action:focus-visible { outline: 2px solid hsl(var(--tac-amber)); outline-offset: 2px; }
@media (pointer: coarse) { .clip-action { width: 44px; height: 44px; } }
</style>
