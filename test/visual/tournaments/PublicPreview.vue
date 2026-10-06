<script setup lang="ts">
// Local-only preview of the real public tournament page (TournamentDetail)
// with fixture data. The component's Apollo queries do not run here; its data
// is seeded from publicFixtures.ts through the component instance.
// ?variant=open|ineligible|wingman|external|finished|se|de|organizer, or
// ?variant=all to stack every variant (for width/overflow sweeps).
import { nextTick, onMounted, ref } from "vue";
import TournamentDetail from "../../../components/tournament/TournamentDetail.vue";
import { TooltipProvider } from "../../../components/ui/tooltip";
import { publicTournament, type Variant } from "./publicFixtures";

const params = new URLSearchParams(location.search);
const requested = params.get("variant") || "open";
const ALL: Variant[] = ["open", "ineligible", "wingman", "external", "finished", "se", "de", "organizer"];
const variants = requested === "all" ? ALL : [requested as Variant];
const manage = params.has("managemode");
const details = ref<any[]>([]);

onMounted(async () => {
  for (const [index, variant] of variants.entries()) {
    const fixture = publicTournament(variant);
    if (params.has("eligibility")) {
      fixture.meets_min_role = params.get("eligibility") !== "user";
      fixture.can_join = fixture.meets_min_role;
      fixture.registration_version = Number(params.get("version") || 1);
      fixture.registration_type = params.get("registration") || "teams";
      fixture.check_in_required = true;
      fixture.check_in_opens_before_minutes = 60;
      fixture.check_in_closes_before_minutes = 15;
      fixture.start = params.has("winter") ? "2026-12-10T13:00:00Z" : "2026-10-10T12:00:00Z";
    }
    // <script setup> components expose a closed proxy; $data is the options
    // API state the page renders from.
    const vm = details.value[index].$data;
    vm.myTeam = params.has("myteam") ? fixture.teams?.[0] : undefined;
    vm.myTeamLoaded = true;
    vm.tournament = params.has("nobanner")
      ? fixture
      : { ...fixture, banner: "fixture-banner.svg" };
  }
  // The page builds banner URLs from the API domain; the fixture uses a local
  // inline image instead (preview-only shim).
  await nextTick();
  const banner = (publicTournament("open") as any).__banner;
  document
    .querySelectorAll<HTMLImageElement>("header img[alt='']")
    .forEach((img) => (img.src = banner));
});
</script>

<template>
  <TooltipProvider>
    <main class="mx-auto grid w-full min-w-0 max-w-[1800px] gap-16 p-4 sm:p-6">
      <section
        v-for="variant in variants"
        :key="variant"
        class="min-w-0"
        :data-variant="variant"
      >
        <TournamentDetail
          :ref="(el: any) => el && details.push(el)"
          :manage-mode="manage"
        />
      </section>
    </main>
  </TooltipProvider>
</template>
