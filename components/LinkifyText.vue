<script setup lang="ts">
// Turns plain text containing URLs into clickable links, without ever
// rendering raw HTML. Two forms are recognized:
//   - a bare URL (https://...), shown as its own text and linked
//   - a Markdown-style [label](https://...) link, shown as the label
// ANY link to this site's own domain (webDomain) becomes an internal
// NuxtLink using just its path -- not only /matches/<id> or
// /players/<steamid> as before. This matters beyond avoiding a full page
// reload: an own-domain link rendered as target="_blank" (the external
// path below) is exactly the kind of navigation Windows/Chrome's PWA
// "link capturing" intercepts and redirects into the installed DEAFCS
// PWA window instead of opening in the browser tab the user actually
// clicked from (reported live, 2026-09-26). Any other http(s) URL still
// becomes a safe external link (target=_blank, rel=noopener). Everything
// else -- plain text, and URLs using any other scheme (javascript:,
// data:, etc) -- is rendered as inert text, never as a link and never
// via v-html.
const props = defineProps<{ text: string | null | undefined }>();

// Group 1+2: [label](url). Group 3: a bare url with no label. Checked as
// one alternation (not two passes) so a bare URL inside a [label](...)
// pair is never double-matched on its own.
const LINK_PATTERN =
  /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s<>"')]+)\)|(https?:\/\/[^\s<>"']+)/g;

type Segment =
  | { type: "text"; value: string }
  | { type: "internal"; value: string; label: string; to: string }
  | { type: "external"; value: string; label: string; href: string };

const webDomain = useRuntimeConfig().public.webDomain;

function toSegment(raw: string, label?: string): Segment {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { type: "text", value: label ? `[${label}](${raw})` : raw };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { type: "text", value: label ? `[${label}](${raw})` : raw };
  }

  const displayLabel = label ?? raw;

  const isOwnDomain =
    !!webDomain &&
    (url.hostname === webDomain || url.hostname === `www.${webDomain}`);
  if (isOwnDomain) {
    return {
      type: "internal",
      value: raw,
      label: displayLabel,
      to: `${url.pathname}${url.search}${url.hash}`,
    };
  }

  return { type: "external", value: raw, label: displayLabel, href: url.toString() };
}

const segments = computed<Segment[]>(() => {
  const text = props.text ?? "";
  if (!text) return [];

  const result: Segment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      result.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    if (match[1] && match[2]) {
      result.push(toSegment(match[2], match[1]));
    } else {
      result.push(toSegment(match[3] ?? match[0]));
    }
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
        :to="segment.to"
        class="text-[hsl(var(--tac-amber))] hover:underline break-all"
      >{{ segment.label }}</NuxtLink>
      <a
        v-else-if="segment.type === 'external'"
        :href="segment.href"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[hsl(var(--tac-amber))] hover:underline break-all"
      >{{ segment.label }}</a>
      <template v-else>{{ segment.value }}</template>
    </template>
  </span>
</template>
