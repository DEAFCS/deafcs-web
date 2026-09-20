import { ref } from "vue";

// Module-scope singleton (deliberately not created inside the composable
// function) shared between TournamentCheckInOverlay.vue (individual) and
// TournamentTeamCheckInOverlay.vue (team/captain). Both are mounted
// globally and unconditionally in layouts/default.vue, and a player can
// simultaneously be registered for one tournament individually and be the
// captain of a team in a different tournament, with both check-in windows
// open at once. Without coordination, two independent AlertDialogs would
// render at the same time: two stacked backdrops and two competing focus
// traps. The individual overlay takes priority; the team overlay's `open`
// computed stays false for as long as this is true.
export const individualCheckInOpen = ref(false);
