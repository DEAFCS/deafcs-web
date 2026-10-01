import { $ } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";

// The one region veto action (a ban). Shared by MatchRegionVeto and the
// match Overview so both send exactly the same request; Postgres
// (verify_region_veto_pick) decides whether the viewer may make it.
export const regionVetoPickMutation = generateMutation({
  insert_match_region_veto_picks_one: [
    {
      object: {
        region: $("region", "String!"),
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
