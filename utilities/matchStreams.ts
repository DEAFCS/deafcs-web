import type { MatchAutoStream } from "~/composables/useTwitchApi";
import { twitchChannelFromLink } from "~/utilities/twitchChannel";
import { matchServerReady } from "~/utilities/matchLifecycle";

// Automatic player POVs belong to actual gameplay only: the match is Live
// AND its server is up (the moment the page leaves "Waiting for server" /
// "Server booting" for the Scoreboard). Before that (ready check, Captain
// Pick, veto, server boot) only manual staff/caster streams are offered.
// Never for the match's own players or coaches (anti-cheat; the API applies
// the same rules server-side).
export function autoPovEligible(
  match:
    | {
        id?: string | null;
        status?: string | null;
        server_id?: string | null;
        is_server_online?: boolean | null;
        is_in_lineup?: boolean | null;
        is_coach?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  if (!match?.id || match.is_in_lineup || match.is_coach) return false;
  return matchServerReady(match as any);
}

// One entry in a match's stream picker (StreamEmbed): the match's own manual
// streams first, in staff priority order, then automatic player POVs.
export type MatchStreamChoice = {
  id: string;
  link: string;
  title: string;
  priority?: number | null;
  is_game_streamer?: boolean | null;
  // Set on automatic player POV streams (never a manual/official stream).
  auto?: { steamId: string; playerName: string; avatarUrl: string | null };
};

export const AUTO_STREAM_ID_PREFIX = "auto-twitch:";

const ENDED_STATUSES = ["Finished", "Forfeit", "Surrendered", "Tie", "Canceled"];
// An ended match keeps its streams for a short outro.
export const STREAMS_AFTER_END_MS = 10 * 60 * 1000;

// The match page's stream block (manual streams, game streamer, and player
// POVs once gameplay is live). Manual streams are staff-attached, so they
// show through every pre-match stage too (ready check, Captain Pick, veto,
// waiting for/booting the server) and for ten minutes after the end. Never
// for the match's own players or coaches (anti-cheat).
export function matchStreamBlockVisible(
  match:
    | { status?: string | null; ended_at?: string | null; is_in_lineup?: boolean | null; is_coach?: boolean | null }
    | null
    | undefined,
  hasStreams: boolean,
  now: number = Date.now(),
): boolean {
  if (!match || !hasStreams || match.is_in_lineup || match.is_coach) return false;
  if (ENDED_STATUSES.includes(match.status ?? "")) {
    return !!match.ended_at && new Date(match.ended_at).getTime() + STREAMS_AFTER_END_MS > now;
  }
  return true;
}

export function autoStreamTitle(playerName: string, t?: (key: string, values?: any) => string) {
  return t ? t("streams.player_pov", { name: playerName }) : `${playerName} POV`;
}

// Manual streams keep their stored order and titles. An automatic stream
// whose Twitch channel staff already attached by hand is dropped (the manual
// one wins: custom title, manual priority), compared case-insensitively.
export function mergeMatchStreams(
  manual: Array<{ id: string; link: string; title?: string | null; priority?: number | null; is_game_streamer?: boolean | null }>,
  auto: MatchAutoStream[] | null | undefined,
  t?: (key: string, values?: any) => string,
): MatchStreamChoice[] {
  const ordered = [...(manual ?? [])].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
  );
  const manualChannels = new Set(
    ordered.map((s) => twitchChannelFromLink(s.link)).filter(Boolean) as string[],
  );
  const seen = new Set<string>();
  const autoChoices: MatchStreamChoice[] = [];
  for (const stream of auto ?? []) {
    const channel = (stream.channel ?? "").toLowerCase();
    if (!channel || manualChannels.has(channel) || seen.has(channel)) continue;
    seen.add(channel);
    autoChoices.push({
      id: `${AUTO_STREAM_ID_PREFIX}${channel}`,
      link: stream.link,
      title: autoStreamTitle(stream.playerName, t),
      auto: {
        steamId: stream.steamId,
        playerName: stream.playerName,
        avatarUrl: stream.avatarUrl,
      },
    });
  }
  return [
    ...ordered.map((s) => ({
      id: s.id,
      link: s.link,
      title: s.title || s.link,
      priority: s.priority,
      is_game_streamer: s.is_game_streamer,
    })),
    ...autoChoices,
  ];
}
