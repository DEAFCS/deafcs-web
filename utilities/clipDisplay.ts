// Adapted from current 5Stack web utilities/clipDisplay.ts (ea7f305).
// MIT License, Copyright (c) 2025 5Stack.gg — see LICENSE.
import type { Clip } from "~/types/clip";
import type { ClipQueueItem } from "~/composables/useClipModal";

export function clipDisplayTitle(title?: string | null, playerName?: string | null): string | null {
  const raw = title?.trim() ?? "";
  if (!raw) return null;
  const player = playerName?.trim();
  if (!player) return raw;
  const escaped = player.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`^${escaped}\\s*[—–-]\\s*`, "i"), "").trim() || raw;
}

// `round` alone identifies the first segment, not necessarily every segment.
// Older auto highlights count extra knife kills in their total.
export function clipRoundKills(clip: Pick<Clip, "kills_count" | "round"> & { title?: string | null }): number | null {
  const kills = clip.kills_count ?? 0;
  if (clip.round == null || kills <= 0) return null;
  const title = clip.title ?? "";
  const bestRound = title.match(/\bBest Round \((\d+)K\)/i);
  if (bestRound) return Math.min(kills, Number(bestRound[1]));
  if (/\bMulti-Kills \((?!1× \d+K\))|\d Knife Kills\b|\bMatch Recap \([^)]*clips\)/i.test(title)) return null;
  return kills;
}

export function formatClipDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function clipQueueItem(c: Clip): ClipQueueItem {
  return {
    id: c.id, title: c.title ?? null, playerName: c.target?.name ?? null,
    teamName: null, durationMs: c.duration_ms ?? null,
    thumbnailUrl: c.thumbnail_download_url ?? null,
    posterUrl: c.match_map?.map?.poster ?? null,
  };
}

// Current upstream bento sizing; fill incomplete rows rather than leaving gaps.
export function highlightCells(clips: Clip[]) {
  if (!clips.length) return [];
  if (clips.length === 1) return [{ clip: clips[0], cols: 12, rows: 2, hero: true }];
  const count = clips.length - 1;
  const spans = count === 1 ? [[6, 2]] : count === 2 ? [[6, 1], [6, 1]]
    : count === 3 ? [[3, 1], [3, 1], [6, 1]]
    : [[3, 1], [3, 1], [3, 1], [3, 1], ...Array.from({ length: count - 4 }, () => [12 / (count - 4), 1])];
  return [{ clip: clips[0], cols: 6, rows: 2, hero: true },
    ...clips.slice(1).map((clip, i) => ({ clip, cols: spans[i][0], rows: spans[i][1], hero: false }))];
}
