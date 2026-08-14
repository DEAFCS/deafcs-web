import { $, order_by, Selector } from "~/generated/zeus";
import { playerFields } from "~/graphql/playerFields";
import { rosterImageSnapshotField } from "~/graphql/rosterImageSnapshotField";

// generated/zeus predates the party_id/party_source columns (needs a live
// Hasura codegen run to pick them up) — spread through `any` so the excess
// property check on the selector literal below doesn't fail the build.
const partyFields: any = {
  party_id: true,
  party_source: true,
};

// Same reason as partyFields above -- generated/zeus predates
// is_leaver_in_match (needs a live Hasura codegen run to pick it up).
const leaverInMatchField: any = {
  is_leaver_in_match: [{ args: { match_id: $("matchId", "uuid!") } }, true],
};

// Shell-only lineup shape. Per-player stats live in matchAllMapsStatsGraphql
// and matchMapStatsGraphql so the page shell doesn't wait on aggregates.
export const matchLineups = Selector("match_lineups")({
  id: true,
  name: true,
  team_id: true,
  team: {
    name: true,
    avatar_url: true,
    roster: [
      {},
      {
        player_steam_id: true,
        roster_image_url: true,
      },
    ],
  },
  is_ready: true,
  is_on_lineup: true,
  can_pick_map_veto: true,
  can_pick_region_veto: true,
  can_update_lineup: true,
  is_picking_map_veto: true,
  is_picking_region_veto: true,
  coach: playerFields,
  captain: {
    placeholder_name: true,
    player: {
      name: true,
      steam_id: true,
    },
  },
  lineup_players: [
    {
      order_by: [
        {
          captain: order_by.desc_nulls_last,
        },
        {
          player: {
            name: $("order_by_name", "order_by!"),
          },
        },
      ],
    },
    {
      captain: true,
      steam_id: true,
      checked_in: true,
      placeholder_name: true,
      ...rosterImageSnapshotField,
      ...partyFields,
      player: {
        ...playerFields,
        // Match-scoped leaver check (see is_leaver_in_match.sql) -- this
        // selector is only ever used inside the single matches_by_pk query
        // on the match page, which already declares $matchId, so the
        // variable reference here binds to that same one.
        ...leaverInMatchField,
      },
    },
  ],
});
