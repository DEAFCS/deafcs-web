import { Selector } from "@/generated/zeus";

export const playerFields = Selector("players")({
  name: true,
  role: true,
  country: true,
  steam_id: true,
  avatar_url: true,
  custom_avatar_url: true,
  roster_image_url: true,
  is_banned: true,
  is_gagged: true,
  is_muted: true,
  // Admin-issued bans only (excludes sanctioned_by_steam_id "0", the
  // reserved system player for automatic leaver/no-show bans) -- used to
  // show the public "BANNED" badge only for a real Sanction, not an
  // automated Abandoned-match ban. is_banned above still reflects either
  // kind, for enforcement checks that should block on both.
  player_sanctions: [
    {
      where: {
        type: { _eq: "ban" },
        deleted_at: { _is_null: true },
        sanctioned_by_steam_id: { _neq: "0" },
      },
    },
    {
      id: true,
      remove_sanction_date: true,
    },
  ],
  vac_banned: true,
  vac_ban_count: true,
  game_ban_count: true,
  days_since_last_ban: true,
  elo: true,
  premier_rank: true,
  premier_rank_updated_at: true,
  faceit_skill_level: true,
  faceit_elo: true,
  faceit_url: true,
  faceit_nickname: true,
});
