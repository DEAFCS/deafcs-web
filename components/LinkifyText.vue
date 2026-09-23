<script setup lang="ts">
// Turns plain text containing URLs into clickable links, without ever
// rendering raw HTML. A DEAFCS match URL or player profile URL (this site's
// own webDomain, /matches/<id> or /players/<steamid>) becomes an internal
// NuxtLink so navigating doesn't force a full page reload; any other
// http(s) URL becomes a safe external link (target=_blank, rel=noopener).
// Everything else -- plain text, and URLs using any other scheme
// (javascript:, data:, etc) -- is rendered as inert text, never as a link
// and never via v-html.
const props = defineProps<{ text: string | null | undefined }>();

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

type Segment =
  | { type: "text"; value: string }
  | { type: "internal"; value: string; routeName: string; id: string }
  | { type: "external"; value: string; href: string };

const webDomain = useRuntimeConfig().public.webDomain;

function toSegment(raw: string): Segment {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { type: "text", value: raw };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { type: "text", value: raw };
  }

  const isOwnDomain =
    !!webDomain &&
    (url.hostname === webDomain || url.hostname === `www.${webDomain}`);
  if (isOwnDomain) {
    const matchMatch = url.pathname.match(/^\/matches\/([0-9a-fA-F-]+)\/?$/);
    if (matchMatch) {
      return {
        type: "internal",
        value: raw,
        routeName: "matches-id",
        id: matchMatch[1],
      };
    }
    const playerMatch = url.pathname.match(/^\/players\/(\d{15,20})\/?$/);
    if (playerMatch) {
      return {
        type: "internal",
        value: raw,
        routeName: "players-id",
        id: playerMatch[1],
      };
    }
  }

  return { type: "external", value: raw, href: url.toString() };
}

const segments = computed<Segment[]>(() => {
  const text = props.text ?? "";
  if (!text) return [];

  const result: Segment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      result.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    result.push(toSegment(match[0]));
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    result.push({ type: "text", value: text.slice(lastIndex) });
  }
  return result;
});
</script>

<template>
  <span class="whitespace-pre-wrap break-words">
    <template v-for="(segment, index) in segments" :key="index">
      <NuxtLink
        v-if="segment.type === 'internal'"
        :to="{ name: segment.routeName, params: { id: segment.id } }"
        class="text-[hsl(var(--tac-amber))] hover:underline break-all"
      >{{ segment.value }}</NuxtLink>
      <a
        v-else-if="segment.type === 'external'"
        :href="segment.href"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[hsl(var(--tac-amber))] hover:underline break-all"
      >{{ segment.value }}</a>
      <template v-else>{{ segment.value }}</template>
    </template>
  </span>
</template>
