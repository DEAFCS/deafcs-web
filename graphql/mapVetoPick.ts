import { $ } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";

// The one map veto action (ban, pick, side or decider). Shared by
// MatchMapVeto and the match Overview so both send exactly the same request;
// Postgres (verify_map_veto_pick) decides whether the viewer may make it.
export const mapVetoPickMutation = generateMutation({
  insert_match_map_veto_picks_one: [
    {
      object: {
        map_id: $("map_id", "uuid!"),
        side: $("side", "String"),
        type: $("type", "e_veto_pick_types_enum!"),
        match_id: $("match_id", "uuid!"),
        match_lineup_id: $("match_lineup_id", "uuid!"),
      },
    },
    {
      id: true,
    },
  ],
});
