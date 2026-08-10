import { Selector } from "~/generated/zeus";

export const tournamentAwardSlotLookupFields = Selector(
  "tournament_award_slots",
)({
  tournament_id: true,
  slot: true,
  custom_name: true,
  silhouette_override: true,
  image_override: true,
});
