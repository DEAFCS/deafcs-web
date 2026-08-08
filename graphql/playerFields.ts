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
  // Plain boolean computed field, unlike the player_sanctions relation this
  // replaced (see revert commit 1ac898a) -- that only had a select_permission
  // for the guest role, so including it in this shared fragment (used by
  // every role site-wide) broke every non-guest query. is_admin_sanctioned
  // carries no sensitive detail (reason, who banned them, etc.) and is
  // exposed to guest/match_organizer/user, same as is_banned above -- true
  // only for a real admin Sanction, not an automated Abandoned leaver ban.
  is_admin_sanctioned: true,
  is_gagged: true,
  is_muted: true,
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
