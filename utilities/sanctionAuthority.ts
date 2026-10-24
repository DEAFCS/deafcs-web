// Adapted from 5Stack WEB 1dd30cc2; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { e_player_roles_enum } from "~/generated/zeus";

// DEAFCS: the AuthStore keeps its roleOrder inside the store (upstream exports
// it), so the same order is listed here. Keep it in step with AuthStore.
const roleOrder = [
  e_player_roles_enum.user,
  e_player_roles_enum.verified_user,
  e_player_roles_enum.streamer,
  e_player_roles_enum.moderator,
  e_player_roles_enum.match_organizer,
  e_player_roles_enum.tournament_organizer,
  e_player_roles_enum.administrator,
];

type IsRoleAbove = (role: e_player_roles_enum) => boolean;

/**
 * Mirrors the api's public.can_sanction_player: sanctioning a player, lifting
 * or re-dating one of their sanctions, and kicking them all need a role
 * strictly above theirs, so nobody acts on an equal -- administrators
 * included. A player with no known role counts as a user, as on the api.
 */
export function outranksPlayer(
  isRoleAbove: IsRoleAbove,
  targetRole?: e_player_roles_enum | string | null,
): boolean {
  const target = roleOrder.indexOf(
    (targetRole ?? e_player_roles_enum.user) as e_player_roles_enum,
  );
  const above = roleOrder[Math.max(target, 0) + 1];

  return !!above && isRoleAbove(above);
}
