<script lang="ts" setup>
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import TournamentManage from "~/components/tournament/TournamentManage.vue";
import { legacyTournamentManageSections, tournamentManageSection, tournamentManageSections } from "~/utilities/tournamentManage";
import TournamentStageBuilder from "~/components/tournament/TournamentStageBuilder.vue";
import TournamentJoinForm from "~/components/tournament/TournamentJoinForm.vue";
import TournamentEntryGate from "~/components/tournament/TournamentEntryGate.vue";
import TournamentCheckInPanel from "~/components/tournament/TournamentCheckInPanel.vue";
import TournamentFreeAgents from "~/components/tournament/TournamentFreeAgents.vue";
import TournamentInviteAccept from "~/components/tournament/TournamentInviteAccept.vue";
import TournamentIndividualPlayers from "~/components/tournament/TournamentIndividualPlayers.vue";
import TournamentTeam from "~/components/tournament/TournamentTeam.vue";
import TournamentRewards from "~/components/tournament/TournamentRewards.vue";
import ManageSection from "~/components/common/ManageSection.vue";
import TournamentStatRibbon from "~/components/tournament/TournamentStatRibbon.vue";
import TournamentCheckInInfo from "~/components/tournament/TournamentCheckInInfo.vue";
import TournamentMatchSetup from "~/components/tournament/TournamentMatchSetup.vue";
import TournamentMatches from "~/components/tournament/TournamentMatches.vue";
import TournamentProgress from "~/components/tournament/TournamentProgress.vue";
import TournamentNotSelectedSection from "~/components/tournament/TournamentNotSelectedSection.vue";
import TournamentSoloRandomBadge from "~/components/tournament/TournamentSoloRandomBadge.vue";
import TournamentResults from "~/components/tournament/TournamentResults.vue";
import TournamentStats from "~/components/tournament/TournamentStats.vue";
import Separator from "~/components/ui/separator/Separator.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import MatchOptionsDisplay from "~/components/match/MatchOptionsDisplay.vue";
import TimeAgo from "~/components/TimeAgo.vue";
import {
  Settings,
  Users,
  Lock,
  Unlock,
  Ban,
  UserPlus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  Globe,
  MapPin,
  Shuffle,
  UserMinus,
  AlertTriangle,
  CalendarDays,
  Layers,
  MessageSquare,
  ChevronDown,
} from "lucide-vue-next";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NuxtLink } from "#components";
import MatchTableRow from "~/components/MatchTableRow.vue";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import {
  tacticalCtaButtonClasses,
  tacticalSectionDescriptionClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
  tacticalTabsTriggerClasses,
} from "~/utilities/tacticalClasses";
import { matchTypeColorStyle } from "~/utilities/matchTypeColors";
import { canLeaveIndividualTournament } from "~/utilities/tournamentAttendance";

// Hero adapted from 5Stack WEB 25dbf95d (TournamentDetail.vue); MIT
// Copyright (c) 2025 5Stack.gg. One surface: the banner as a band on top
// (never text over the image, so any artwork works), badges, name and meta
// under it, actions on the right, the tab row at the foot.
const tournamentHeroClasses =
  "overflow-hidden rounded-xl border border-border bg-card/40";
const tournamentBannerClasses =
  "aspect-[5/2] max-h-[18.75rem] w-full bg-muted/40 sm:aspect-[4/1]";
const tournamentHeroBodyClasses =
  "flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 pt-5 max-sm:px-4 max-sm:pt-4";
const tournamentHeroLogoClasses =
  "h-11 w-11 shrink-0 rounded-md border border-border bg-muted/30 object-contain sm:row-span-3 sm:h-16 sm:w-16";
const tournamentHeroNameClasses =
  "m-0 min-w-0 break-words text-[clamp(1.5rem,3.4vw,2.25rem)] font-extrabold leading-[1.05] [text-wrap:balance]";
const tournamentHeroTagClasses =
  "inline-flex h-6 items-center rounded-md border border-border bg-muted/30 px-2 text-xs font-semibold text-muted-foreground";
// DEAFCS keeps its own mode colours (Competitive / Wingman / Duel) on the
// 5Stack tag geometry.
const tournamentHeroModeTagClasses =
  "inline-flex h-6 items-center rounded-md border border-[rgb(var(--mode-rgb)_/_0.45)] bg-[rgb(var(--mode-rgb)_/_0.14)] px-2 text-xs font-semibold text-[rgb(var(--mode-rgb))]";
const tournamentHeroMetaClasses =
  "flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.8rem] text-muted-foreground";
// Compact avatar row in the meta line (5Stack treatment); no separate
// "Organized by" label in the hero any more.
const tournamentHeroOrganizersClasses = "inline-flex items-center gap-1";
const tournamentHeroOrganizerClasses =
  "inline-flex cursor-pointer rounded-md transition-[opacity,transform] duration-150 hover:-translate-y-px hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.5)]";
const tournamentHeroActionsClasses =
  "flex flex-wrap items-center gap-2 max-sm:w-full";
const tournamentHeroStatusClasses =
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-semibold";
const tournamentHeroStatusTierClasses: Record<string, string> = {
  live: "border-destructive/55 bg-destructive/15 text-destructive",
  open: "border-success/55 bg-success/15 text-success",
  pending:
    "border-[hsl(var(--tac-amber)_/_0.5)] bg-[hsl(var(--tac-amber)_/_0.12)] text-[hsl(var(--tac-amber))]",
  paused: "border-warning/55 bg-warning/15 text-warning",
  finished:
    "border-[hsl(var(--topnav-accent)_/_0.5)] bg-[hsl(var(--topnav-accent)_/_0.15)] text-[hsl(var(--topnav-accent))]",
  ended: "border-border bg-muted/40 text-muted-foreground",
};
const tournamentHeroJoinButtonClasses = [
  tacticalCtaButtonClasses,
  "h-9 px-4 py-2 text-[0.68rem] tracking-[0.14em] max-sm:flex-1",
];
const tournamentHeroLeaveButtonClasses =
  "h-9 gap-1.5 border border-destructive/50 bg-destructive/10 px-4 text-destructive hover:bg-destructive/20 max-sm:flex-1";
const tournamentHeroTabsClasses = "mt-4 border-t border-border px-2 sm:px-3";
const tournamentTabTriggerClasses = [tacticalTabsTriggerClasses, "h-11 shrink-0"];
const tournamentChatRoomUnreadClasses =
  "inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 font-sans text-[0.6rem] font-bold leading-none tracking-normal text-white tabular-nums";
const tacticalSectionCountClasses =
  "rounded-full border border-[hsl(var(--tac-amber)_/_0.4)] bg-[hsl(var(--tac-amber)_/_0.12)] px-[0.45rem] py-[0.05rem] text-[0.62rem] tracking-[0.08em] text-[hsl(var(--tac-amber))]";
const tournamentTeamCardClasses =
  "rounded-lg border border-border bg-card/45 px-5 py-4 [backdrop-filter:blur(6px)] transition-colors duration-150 hover:border-[hsl(var(--tac-amber)_/_0.35)] hover:bg-card/60";
const myTeamClasses = "max-w-[900px]";
const myTeamHeaderClasses = "mb-4 flex flex-col gap-[0.35rem]";
const myTeamLabelClasses =
  "inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground";
const myTeamHintClasses = "text-[0.8rem] text-muted-foreground/80";
const tacticalCornerCardClasses =
  "relative rounded-lg border border-border px-6 py-5 [background:linear-gradient(180deg,hsl(var(--card)_/_0.65)_0%,hsl(var(--card)_/_0.35)_100%)] [backdrop-filter:blur(6px)] before:pointer-events-none before:absolute before:-left-px before:-top-px before:h-3 before:w-3 before:border-l-2 before:border-t-2 before:border-[hsl(var(--tac-amber))] before:content-[''] after:pointer-events-none after:absolute after:-bottom-px after:-right-px after:h-3 after:w-3 after:border-b-2 after:border-r-2 after:border-[hsl(var(--tac-amber))] after:content-['']";
</script>

<template>
  <div v-if="tournament" class="min-w-0">
    <div v-if="manageMode && !tournament.is_organizer" role="alert" class="rounded-lg border border-border p-6">
      {{ $t("tournament.manage.no_permission") }}
      <NuxtLink :to="`/tournaments/${tournament.id}`" class="block mt-3 text-[hsl(var(--tac-amber))]">{{ $t("tournament.manage.view_tournament") }}</NuxtLink>
    </div>
    <template v-else>
    <NuxtLink
      v-if="leagueSeasonId"
      :to="{
        name: 'league-seasons-seasonId',
        params: { seasonId: leagueSeasonId },
      }"
      class="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-[hsl(var(--tac-amber))]"
    >
      <ArrowLeft class="h-4 w-4" />
      {{ $t("tournament.page.back_to_league") }}
    </NuxtLink>
    <Tabs v-model="activeTab" default-value="overview">
      <PageTransition>
        <!-- Header adapted from 5Stack WEB 25dbf95d (TournamentDetail.vue);
             MIT Copyright (c) 2025 5Stack.gg. One surface: banner band on top,
             badges, name and meta under it, actions on the right, tab row at
             the foot. DEAFCS keeps its mode colours, Join/Leave rules, Chat
             Room access and the separate Manage console. -->
        <header
          :class="tournamentHeroClasses"
          :style="matchTypeColorStyle(tournament.options?.type)"
        >
          <div v-if="tournamentBannerSrc" :class="tournamentBannerClasses">
            <img
              :src="tournamentBannerSrc"
              alt=""
              class="h-full w-full object-cover object-[50%_40%]"
            />
          </div>

          <div :class="tournamentHeroBodyClasses">
            <!-- Phones: the logo sits beside the badges so the name and meta
                 run the full width; from sm it spans all three rows. -->
            <div
              class="grid min-w-0 gap-2"
              :class="
                tournamentLogoSrc &&
                'grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 sm:items-start sm:gap-x-4'
              "
            >
              <img
                v-if="tournamentLogoSrc"
                :src="tournamentLogoSrc"
                :alt="tournament.name"
                :class="tournamentHeroLogoClasses"
              />
              <div
                class="flex flex-wrap items-center gap-1.5"
                data-testid="tournament-hero-badges"
              >
                <span
                  :class="[
                    tournamentHeroStatusClasses,
                    tournamentHeroStatusTierClasses[statusTier] ??
                      tournamentHeroStatusTierClasses.ended,
                  ]"
                  data-testid="tournament-status-badge"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
                  {{ tournament.e_tournament_status.description }}
                </span>
                <span
                  :class="tournamentHeroModeTagClasses"
                  data-testid="tournament-mode-badge"
                >
                  {{ tournament.options.type }}
                </span>
                <!-- Same shared badge the listing card uses. -->
                <TournamentSoloRandomBadge
                  v-if="isIndividualRegistration"
                  :match-type="tournament.options?.type"
                  size="detail"
                />
                <span
                  v-for="category in tournamentCategories"
                  :key="category"
                  :class="tournamentHeroTagClasses"
                >
                  {{ category }}
                </span>
              </div>
              <h1
                :class="[
                  tournamentHeroNameClasses,
                  tournamentLogoSrc && 'col-span-2 sm:col-span-1',
                ]"
              >
                {{ tournament.name }}
              </h1>
              <div
                :class="[
                  tournamentHeroMetaClasses,
                  tournamentLogoSrc && 'col-span-2 sm:col-span-1',
                ]"
              >
                <span
                  class="inline-flex items-center gap-1.5"
                  data-testid="tournament-hero-start"
                >
                  <CalendarDays class="h-3.5 w-3.5" />
                  <TimeAgo :date="tournament.start" hide-icon />
                </span>
                <span
                  v-if="shortLocation"
                  class="inline-flex min-w-0 items-center gap-1.5"
                >
                  <MapPin class="h-3.5 w-3.5 shrink-0" />
                  <span class="truncate">{{ shortLocation }}</span>
                </span>
                <!-- Before any stage exists the format falls back to the mode,
                     which the mode badge already shows. -->
                <span
                  v-if="formatLabel && formatLabel !== tournament.options?.type"
                  class="inline-flex items-center gap-1.5"
                >
                  <Layers class="h-3.5 w-3.5" />
                  {{ formatLabel }}
                </span>
                <a
                  v-if="tournamentHomepage"
                  :href="tournamentHomepage"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 underline decoration-muted-foreground/40 underline-offset-[3px] transition-colors hover:text-foreground"
                  data-testid="tournament-homepage-link"
                >
                  <Globe class="h-3.5 w-3.5" />
                  {{ $t("tournament.form.homepage.link") }}
                </a>
                <span
                  v-if="organizersList.length"
                  :class="tournamentHeroOrganizersClasses"
                  :aria-label="$t('tournament.organizer.organized_by')"
                >
                  <template
                    v-for="organizer in organizersList.slice(0, 6)"
                    :key="organizer.steam_id"
                  >
                    <HoverCard :open-delay="80" :close-delay="140">
                      <HoverCardTrigger as-child>
                        <NuxtLink
                          :to="{
                            name: 'players-id',
                            params: { id: organizer.steam_id },
                          }"
                          :class="tournamentHeroOrganizerClasses"
                          :aria-label="organizer.name"
                        >
                          <Avatar shape="square" class="h-6 w-6">
                            <AvatarImage
                              v-if="organizerAvatarSrc(organizer)"
                              :src="organizerAvatarSrc(organizer)"
                              :alt="organizer.name"
                            />
                            <AvatarFallback class="text-[0.6rem]">
                              {{ organizer?.name.slice(0, 2) }}
                            </AvatarFallback>
                          </Avatar>
                        </NuxtLink>
                      </HoverCardTrigger>
                      <HoverCardContent class="w-64 p-0">
                        <div class="p-4">
                          <PlayerDisplay
                            :player="organizer"
                            :linkable="true"
                            :tooltip="false"
                            :match-type="tournament.options?.type || null"
                            :elo-interactive="false"
                          />
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </template>
                  <span
                    v-if="organizersList.length > 6"
                    class="ml-1 text-xs tabular-nums"
                  >
                    +{{ organizersList.length - 6 }}
                  </span>
                </span>
              </div>
            </div>

            <div :class="tournamentHeroActionsClasses">
              <!-- Same rule as the player-row Leave action: being checked in
                   never blocks leaving. -->
              <Button
                v-if="!manageMode && isIndividualRegistration && myIndividualSignup"
                :class="tournamentHeroLeaveButtonClasses"
                :disabled="individualActionBusy || !canLeaveIndividually"
                @click="leaveIndividually"
              >
                <UserMinus class="h-4 w-4" />
                {{ $t("tournament.join.individual.leave") }}
              </Button>
              <Button
                v-else-if="
                  !manageMode &&
                  isIndividualRegistration &&
                  tournament.status === e_tournament_status_enum.RegistrationOpen
                "
                participation
                :class="tournamentHeroJoinButtonClasses"
                :disabled="individualActionBusy"
                @click="handleJoinTournament"
              >
                <UserPlus class="h-4 w-4" />
                {{ $t("tournament.join.title") }}
              </Button>
              <Button
                v-else-if="
                  !manageMode &&
                  !isIndividualRegistration &&
                  tournament.status ===
                    e_tournament_status_enum.RegistrationOpen &&
                  tournament.can_join
                "
                participation
                :class="tournamentHeroJoinButtonClasses"
                @click="handleJoinTournament"
              >
                <UserPlus class="h-4 w-4" />
                {{ $t("tournament.join.title") }}
              </Button>

              <!-- Not a tab: opens this tournament's room in the Chat Hub.
                   Shown only while the Chat Hub itself lists this tournament
                   (participants, assigned organizers, administrators; 24h
                   after finishing). -->
              <Button
                v-if="chatRoomTournament"
                variant="outline"
                class="relative max-sm:w-9 max-sm:px-0"
                :title="$t('tournament.page.chat_room_tab')"
                data-testid="tournament-chat-room-tab"
                @click="openChatRoom"
              >
                <MessageSquare class="h-4 w-4 shrink-0" />
                <span class="max-sm:sr-only">
                  {{ $t("tournament.page.chat_room_tab") }}
                </span>
                <span
                  v-if="chatRoomUnreadLabel"
                  :class="tournamentChatRoomUnreadClasses"
                >
                  {{ chatRoomUnreadLabel }}
                </span>
              </Button>

              <!-- Public page: Manage opens the console, its menu jumps to a
                   section. Inside the console: back to the page, and the menu
                   holds the status actions. -->
              <ButtonGroup v-if="tournament?.is_organizer">
                <Button
                  v-if="!manageMode"
                  as-child
                  variant="outline"
                  class="max-sm:w-9 max-sm:px-0"
                >
                  <NuxtLink
                    :to="`/tournaments/${tournament.id}/manage`"
                    :title="$t('tournament.manage.button')"
                    data-testid="tournament-manage-link"
                  >
                    <Settings class="h-4 w-4" />
                    <span class="max-sm:sr-only">{{
                      $t("tournament.manage.button")
                    }}</span>
                  </NuxtLink>
                </Button>
                <Button
                  v-else
                  as-child
                  variant="outline"
                  class="border-[hsl(var(--tac-amber)/0.6)] bg-[hsl(var(--tac-amber)/0.1)] text-foreground max-sm:w-9 max-sm:px-0"
                >
                  <NuxtLink
                    :to="`/tournaments/${tournament.id}`"
                    :title="$t('tournament.manage.view_tournament')"
                  >
                    <Settings class="h-4 w-4" />
                    <span class="max-sm:sr-only">{{
                      $t("tournament.manage.button")
                    }}</span>
                  </NuxtLink>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="outline"
                      size="icon"
                      :aria-label="
                        manageMode
                          ? $t('tournament.manage.status_actions')
                          : $t('tournament.manage.sections_menu')
                      "
                      data-testid="tournament-manage-menu"
                    >
                      <ChevronDown class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    v-if="!manageMode"
                    class="w-60"
                    align="end"
                  >
                    <DropdownMenuLabel>
                      {{ $t("tournament.manage.title") }}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      v-for="item in tournamentManageSections"
                      :key="item.key"
                      as-child
                    >
                      <NuxtLink
                        :to="{
                          path: `/tournaments/${tournament.id}/manage`,
                          query: { section: item.key },
                        }"
                      >
                        {{ item.label }}
                      </NuxtLink>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  <DropdownMenuContent v-else class="w-60" align="end">
                    <DropdownMenuLabel>
                      {{ $t("tournament.manage.status_actions") }}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      v-if="tournament.can_open_registration"
                      @click="openRegistration"
                    >
                      <Unlock />
                      <span>{{
                        $t("tournament.actions.open_registration")
                      }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="tournament.can_close_registration"
                      @click="closeRegistration"
                    >
                      <Lock />
                      <span>{{
                        $t("tournament.actions.close_registration")
                      }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="canGenerateTeams"
                      @click="generateTeams"
                    >
                      <Shuffle />
                      <span>{{ $t("tournament.actions.generate_teams") }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="tournament.can_start && !tournament.can_resume"
                      @click="startTournament"
                    >
                      <Play />
                      <span>{{ $t("tournament.actions.start") }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="tournament.can_pause"
                      @click="pauseDialogOpen = true"
                    >
                      <Pause />
                      <span>{{ $t("tournament.actions.pause") }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="tournament.can_resume"
                      @click="resumeDialogOpen = true"
                    >
                      <Play />
                      <span>{{ $t("tournament.actions.resume") }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="tournament.can_setup && !leagueSeasonId"
                      @click="resetToSetup"
                    >
                      <RotateCcw />
                      <span>{{ $t("tournament.actions.reset_to_setup") }}</span>
                    </DropdownMenuItem>
                    <template v-if="!leagueSeasonId">
                      <DropdownMenuSeparator
                        v-if="
                          tournament.can_cancel ||
                          (canDeleteTournament &&
                            tournament.status !== e_tournament_status_enum.Live)
                        "
                      />
                      <DropdownMenuItem
                        v-if="tournament.can_cancel"
                        class="text-destructive"
                        @click="cancelTournament"
                      >
                        <Ban />
                        <span>{{ $t("tournament.actions.cancel") }}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="
                          canDeleteTournament &&
                          tournament.status !== e_tournament_status_enum.Live
                        "
                        class="text-destructive"
                        @click="deleteDialogOpen = true"
                      >
                        <Trash2 />
                        <span>{{ $t("tournament.actions.delete") }}</span>
                      </DropdownMenuItem>
                    </template>
                    <p
                      v-if="!hasStatusActions"
                      class="px-2 py-1.5 text-xs text-muted-foreground"
                    >
                      {{ $t("tournament.manage.no_status_actions") }}
                    </p>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            </div>
          </div>

          <div :class="tournamentHeroTabsClasses">
            <div
              v-if="manageMode"
              class="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1.5"
            >
              <span class="px-1 text-sm font-semibold">
                {{ $t("tournament.manage.title") }}
              </span>
              <Button variant="ghost" size="sm" as-child>
                <NuxtLink :to="`/tournaments/${tournament.id}`">
                  <ArrowLeft class="h-4 w-4" />
                  {{ $t("tournament.manage.back") }}
                </NuxtLink>
              </Button>
            </div>
            <TabsList
              v-else
              variant="underline"
              class="h-auto w-full min-w-0 flex-nowrap !justify-start overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-testid="tournament-public-tabs"
            >
              <TabsTrigger
                v-for="tab in publicTabs"
                :key="tab.value"
                :value="tab.value"
                :class="tournamentTabTriggerClasses"
                :data-testid="`tournament-tab-${tab.value}`"
              >
                {{ tab.label }}
              </TabsTrigger>
            </TabsList>
          </div>
        </header>
      </PageTransition>

      <!-- As on 5Stack: directly under the header, above every tab. Whether
           the viewer can enter at all (and which gate stops them), then
           registration/check-in, so a deadline is never scrolled past.
           The entry gate only displays backend-computed fields (min_role +
           meets_min_role, ELO bounds, invite_only + registration_unlocked)
           that every registration version has. Invites and the check-in panel
           are version-2 only; v1 uses the same before-registration design. -->
      <div v-if="!manageMode" data-testid="tournament-entry-area">
        <TournamentInviteAccept v-if="isUnifiedRegistration" :tournament="tournament" :registration="tournament" />
        <TournamentEntryGate :tournament="tournament" :registration="tournament" :already-entered="!!myTeam || !!myFreeAgent || !!myIndividualSignup" />
        <!-- Legacy timing/actions remain separate from unified registration. -->
        <TournamentCheckInInfo
          v-if="!isUnifiedRegistration"
          :tournament="tournament"
          :is-individual-registration="!!tournament.options?.individual_registration_enabled"
          :already-entered="!!myTeam || !!myIndividualSignup"
          @register="handleJoinTournament"
        />
        <TournamentCheckInPanel v-if="isUnifiedRegistration" :tournament="tournament" :registration="tournament" :teams="tournament.teams" :my-team-id="myTeam?.id" :my-free-agent="myFreeAgent" @register="handleJoinTournament" />
      </div>

      <div
        v-if="tournament.status === e_tournament_status_enum.Paused"
        class="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {{ $t("tournament.paused_banner") }}
      </div>

      <div class="mt-6">
        <TournamentManage class="mt-6" v-if="manageMode && tournament.is_organizer"
          :tournament="tournament" :registration="tournament"
          :check-in-teams="tournament.teams || []"
          :check-in-review-visible="isUnifiedRegistration && tournament.status === 'CheckInReview'"
          :section="manageSection" @update:section="setManageSection" />
        <div v-if="!manageMode">
        <TabsContent value="overview">
          <div>
            <div class="flex flex-col gap-6">
              <TournamentStatRibbon
                :prize-pool="prizePool"
                :teams-count="teamsCount"
                :format="formatLabel"
                :start="tournament.start"
                :location="shortLocation"
              ></TournamentStatRibbon>

              <TournamentProgress
                :tournament="tournament"
                :show-matches-link="matchesTabVisible"
                @open-tab="(tab) => (activeTab = tab)"
              ></TournamentProgress>

              <ManageSection
                v-if="tournament.options"
                :label="$t('tournament.page.match_setup.title')"
              >
                <TournamentMatchSetup
                  :tournament="tournament"
                  :format="formatLabel"
                ></TournamentMatchSetup>
                <!-- Was on the removed public "Tournament Settings" tab; the
                     full match settings are already in Match Setup above. -->
                <div class="grid gap-1" data-testid="tournament-overview-rules">
                  <NuxtLink
                    to="/tournament-rules"
                    class="inline-flex w-fit items-center text-xs text-muted-foreground hover:text-[hsl(var(--tac-amber))]"
                  >
                    {{ $t("tournament.page.view_tournament_rules") }}
                  </NuxtLink>
                  <p class="text-xs text-muted-foreground/70">
                    {{ $t("tournament.page.tournament_rules_hint") }}
                  </p>
                </div>
              </ManageSection>

              <TournamentRewards
                :prizes="tournament.prizes"
                :tournament-id="tournament.id"
                :awards-enabled="tournament.trophies_enabled ?? false"
                :match-type="tournament.options?.type || null"
                :min-players-per-lineup="tournament.min_players_per_lineup ?? null"
              ></TournamentRewards>

              <ManageSection
                v-if="tournament.description"
                :label="$t('tournament.page.about_section')"
              >
                <div class="flex flex-col gap-3">
                  <p
                    class="max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
                    :class="{ 'line-clamp-[8]': !descExpanded }"
                  >
                    {{ tournament.description }}
                  </p>
                  <button
                    v-if="descLong"
                    type="button"
                    class="self-start text-xs font-semibold text-[hsl(var(--tac-amber))] transition-opacity hover:opacity-80"
                    @click="descExpanded = !descExpanded"
                  >
                    {{
                      descExpanded
                        ? $t("tournament.page.read_less")
                        : $t("tournament.page.read_more")
                    }}
                  </button>
                </div>
              </ManageSection>
            </div>
          </div>
        </TabsContent>
        <!-- Bracket on its own tab, as on 5Stack's 2026-10-04 tournament
             page: the Overview stays readable and the progress strip links
             here. Same TournamentStageBuilder as before, unchanged. -->
        <TabsContent value="bracket">
          <TournamentStageBuilder
            class="w-full"
            :tournament="tournament"
            :read-only="true"
          >
            <template #empty-action>
              <Button
                v-if="tournament.is_organizer"
                variant="outline"
                size="sm"
                as-child
              >
                <NuxtLink
                  :to="{
                    path: `/tournaments/${tournament.id}/manage`,
                    query: { section: 'stages' },
                  }"
                >
                  <Layers class="h-4 w-4" />
                  {{ $t("tournament.manage.stages") }}
                </NuxtLink>
              </Button>
            </template>
          </TournamentStageBuilder>
        </TabsContent>
        <TabsContent v-if="matchesTabVisible" value="matches">
          <TournamentMatches :tournament-id="tournament.id"></TournamentMatches>
        </TabsContent>
        <TabsContent value="my-team" v-if="myTeam">
          <div>
            <div :class="myTeamClasses">
              <div :class="myTeamHeaderClasses">
                <div :class="myTeamLabelClasses">
                  <span :class="tacticalSectionTickClasses"></span>
                  {{ $t("tournament.page.my_team") }}
                </div>
                <div :class="myTeamHintClasses">
                  {{ $t("tournament.page.my_team_hint") }}
                </div>
              </div>

              <div :class="tacticalCornerCardClasses">
                <TournamentTeam
                  :tournament="tournament"
                  :team="myTeam" :read-only-admin="true"
                ></TournamentTeam>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent v-if="isUnifiedRegistration && tournament.registration_type !== 'teams'" value="free-agents">
          <TournamentFreeAgents :tournament="tournament" :read-only-admin="true" />
        </TabsContent>
        <TabsContent value="teams">
          <TournamentIndividualPlayers
            v-if="isIndividualRegistration"
            :tournament="tournament"
            :read-only-admin="true"
          />
          <div
            v-else
            class="grid gap-6 items-start"
          >
            <div class="min-w-0">
              <div :class="[tacticalSectionLabelClasses, 'mb-[0.85rem]']">
                <span :class="tacticalSectionTickClasses"></span>
                {{ $t("tournament.page.roster_section") }}
                <span :class="tacticalSectionCountClasses">
                  {{ visibleTeams.length }}
                </span>
              </div>

              <div
                v-if="visibleTeams.length === 0"
                class="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground"
              >
                {{ $t("tournament.page.no_teams_yet") }}
              </div>

              <div class="space-y-4">
                <div v-for="team of visibleTeams" :key="team.id">
                  <div :class="tournamentTeamCardClasses">
                    <TournamentTeam
                      :tournament="tournament"
                      :team="team" :read-only-admin="true"
                    ></TournamentTeam>
                  </div>
                </div>
              </div>

              <!-- Directly under the generated teams: who did not make the
                   selected pool. Renders itself only once Solo Random teams
                   exist, so a normal team tournament never shows it. -->
              <TournamentNotSelectedSection
                v-if="!isUnifiedRegistration"
                :tournament="tournament"
              ></TournamentNotSelectedSection>
            </div>

          </div>
        </TabsContent>
        <TabsContent v-if="standingsTabVisible" value="standings">
          <div>
            <TournamentResults
              :tournament="tournament"
              :show-standings="true"
              :show-matches="false"
            />
          </div>
        </TabsContent>
        <TabsContent v-if="statsTabVisible" value="stats">
          <div>
            <TournamentStats
              :tournament="tournament"
              :active="activeTab === 'stats'"
            />
          </div>
        </TabsContent>
        </div>
      </div>
    </Tabs>

    <!-- Join Tournament Sheet - Available for all tabs -->
    <Sheet
      :open="joinSheetOpen"
      @update:open="(open) => (joinSheetOpen = open)"
    >
      <SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle class="text-2xl">
            {{ $t("tournament.join.title") }}
          </SheetTitle>
          <!-- The roster-size requirement is a TEAM tournament rule. Showing
               it unconditionally told Solo Random players "You need at least 2
               players to join this tournament" on a format whose entire point
               is signing up alone -- the form body below already branched
               correctly, only this header did not. -->
          <SheetDescription>
            {{
              tournament.options?.individual_registration_enabled
                ? $t("tournament.join.individual.sheet_description")
                : $t("tournament.join.requirements", {
                    count: tournament.min_players_per_lineup,
                  })
            }}
          </SheetDescription>
        </SheetHeader>

        <div class="mt-6">
          <TournamentJoinForm
            :tournament="tournament"
            @close="joinSheetOpen = false"
          />
        </div>
      </SheetContent>
    </Sheet>

    <!-- Delete Tournament Dialog -->
    <AlertDialog
      v-if="canDeleteTournament"
      :open="deleteDialogOpen"
      @update:open="(open) => (deleteDialogOpen = open)"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("tournament.actions.confirm_delete")
          }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t("tournament.actions.delete_description") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t("common.cancel") }}</AlertDialogCancel>
          <AlertDialogAction
            @click="deleteTournament"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {{ $t("tournament.actions.delete") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Pause Tournament Dialog -->
    <AlertDialog
      :open="pauseDialogOpen"
      @update:open="(open) => (pauseDialogOpen = open)"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("tournament.actions.confirm_pause")
          }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t("tournament.actions.pause_description") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t("common.cancel") }}</AlertDialogCancel>
          <AlertDialogAction @click="pauseTournament">
            {{ $t("tournament.actions.pause") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Resume Tournament Dialog -->
    <AlertDialog
      :open="resumeDialogOpen"
      @update:open="(open) => (resumeDialogOpen = open)"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("tournament.actions.resume")
          }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t("tournament.actions.resume_description") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t("common.cancel") }}</AlertDialogCancel>
          <AlertDialogAction @click="resumeTournament">
            {{ $t("tournament.actions.resume") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </template>
  </div>
  <div v-else-if="tournamentLoadError" class="mx-auto max-w-lg py-16">
    <Alert variant="destructive">
      <AlertDescription class="flex items-center gap-2">
        <AlertTriangle class="h-4 w-4" />
        {{ $t("tournament.page.load_error") }}
      </AlertDescription>
    </Alert>
  </div>
</template>

<script lang="ts">
import { $, e_tournament_status_enum, order_by } from "~/generated/zeus";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { useAuthStore } from "~/stores/AuthStore";
import tournamentTeamFields from "~/graphql/tournamentTeamFields";
import { playerFields } from "~/graphql/playerFields";
import { rosterImageSnapshotField } from "~/graphql/rosterImageSnapshotField";
import { generateMutation, generateQuery } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";
import { matchOptionsFields } from "~/graphql/matchOptionsFields";
import { formatPrizePool } from "~/utilities/prizePool";
import { resolveAvatarUrl } from "~/utilities/avatarUrl";
import { externalTournamentHomepage } from "~/utilities/tournamentHomepage";
import {
  getRequestedRouteTab,
  getRouteTabValue,
  normalizeRouteTab,
  replaceRouteTab,
} from "~/composables/useRouteTab";
import { useChatTabs } from "~/composables/useChatTabs";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";
import {
  findChatTournament,
  formatChatRoomUnread,
  openTournamentChatRoom,
  tournamentChatTabId,
} from "~/composables/useTournamentChatRoom";

export default {
  props: { manageMode: { type: Boolean, default: false } },
  data() {
    return {
      myTeam: undefined,
      tournament: undefined,
      tournamentLoadError: false,
      tournamentDialog: false,
      teamSearchQuery: undefined,
      settingsDialogOpen: false,
      organizersDialogOpen: false,
      joinSheetOpen: false,
      descExpanded: false,
      deleteDialogOpen: false,
      pauseDialogOpen: false,
      resumeDialogOpen: false,
      activeTab: "overview",
      myTeamLoaded: false,
      e_match_types: [],
      individualActionBusy: false,
    };
  },
  unmounted() {
    useTournamentContext().value = null;
  },
  apollo: {
    e_match_types: {
      fetchPolicy: "cache-first",
      query: generateQuery({
        e_match_types: [
          {},
          {
            value: true,
            description: true,
          },
        ],
      }),
      result({
        data,
      }: {
        data: { e_match_types: Array<{ value: string; description: string }> };
      }) {
        this.e_match_types = data.e_match_types;
      },
    },
    $subscribe: {
      tournaments_by_pk: {
        query: typedGql("subscription")({
          tournaments_by_pk: [
            {
              id: $("tournamentId", "uuid!"),
            },
            {
              id: true,
              name: true,
              start: true,
              status: true,
              auto_start: true,
              ...{
                registration_version: true, registration_type: true, min_elo: true, max_elo: true,
                invite_only: true, check_in_required: true, check_in_setting: true,
                check_in_opens_before_minutes: true, check_in_closes_before_minutes: true,
                check_in_ends_at: true, check_in_open: true, check_in_started: true,
                missed_check_in_count: true, registration_unlocked: true,
                free_agents: [{}, { id: true, party_id: true, player_steam_id: true, status: true, checked_in_at: true,
                  tournament_team_id: true, player: { steam_id: true, name: true } }],
              } as {},
              substitutes_enabled: true,
              scheduling_mode: true,
              // A league's division tournament: its fixtures are negotiated
              // on the league schedule, not on the bracket cards.
              league_season_division: { id: true },
              e_tournament_status: {
                description: true,
              },
              description: true,
              logo: true,
              banner: true,
              homepage: true,
              location: true,
              latitude: true,
              longitude: true,
              min_role: true,
              trophies_enabled: true,
              organizer_steam_id: true,
              is_organizer: true,
              can_join: true,
              meets_min_role: true,
              can_start: true,
              can_cancel: true,
              can_open_registration: true,
              can_close_registration: true,
              can_pause: true,
              can_resume: true,
              can_setup: true,
              min_players_per_lineup: true,
              max_players_per_lineup: true,
              admin: playerFields,
              options: matchOptionsFields,
              individual_check_in_ends_at: true,
              individual_check_in_duration_minutes: true,
              attendance_check_in_open_before_minutes: true,
              attendance_check_in_close_before_minutes: true,
              individual_signups: [
                {},
                {
                  id: true,
                  player_steam_id: true,
                  status: true,
                  checked_in_at: true,
                  // Which generated team this signup landed on, if any.
                  // Already exposed to guest/user; drives two things with no
                  // backend change: identifying teams that came out of Solo
                  // Random generation, and telling a finalized sit-out
                  // ("Waitlisted, teams generated, no team") apart from a
                  // player still waiting before the cutoff.
                  tournament_team_id: true,
                  // The shared playerFields fragment, not a hand-rolled
                  // subset. The previous three-field selection was why every
                  // Solo Random row fell back to the globe icon (no country),
                  // could not link to a profile (no steam_id), and showed no
                  // ELO -- PlayerDisplay was being handed a player object it
                  // could not work with. Every other participant list on the
                  // site already passes this fragment.
                  player: playerFields,
                },
              ],
              organizers: [
                {},
                {
                  organizer: playerFields,
                },
              ],
              organizer_teams: [
                {},
                {
                  team_id: true,
                  team: {
                    id: true,
                    name: true,
                    short_name: true,
                    avatar_url: true,
                  },
                },
              ],
              categories: [
                {},
                {
                  category: true,
                  e_tournament_category: {
                    value: true,
                    description: true,
                  },
                },
              ],
              prizes: [
                {
                  order_by: [
                    {
                      order: order_by.asc,
                    },
                  ],
                },
                {
                  id: true,
                  place: true,
                  prize: true,
                  order: true,
                },
              ],
              teams: [
                {
                  order_by: [
                    {
                      seed: order_by.asc,
                    },
                    {
                      eligible_at: order_by.asc,
                    },
                    {
                      created_at: order_by.asc,
                    },
                  ],
                },
                tournamentTeamFields,
              ],
              teams_aggregate: [
                {},
                {
                  aggregate: {
                    count: true,
                  },
                },
              ],
              stages: [
                {
                  order_by: [
                    {
                      order: order_by.asc,
                    },
                  ],
                },
                {
                  id: true,
                  type: true,
                  e_tournament_stage_type: {
                    description: true,
                  },
                  order: true,
                  groups: true,
                  min_teams: true,
                  max_teams: true,
                  max_rounds: true,
                  swiss_no_elimination: true,
                  decider_best_of: true,
                  default_best_of: true,
                  final_map_advantage: true,
                  settings: true,
                  third_place_match: true,
                  // Where negotiated proposals may fall, per round (the
                  // proposal trigger enforces the same window).
                  windows: [
                    {},
                    { round: true, opens_at: true, closes_at: true },
                  ],
                  options: matchOptionsFields,
                  results: [
                    {},
                    {
                      tournament_team_id: true,
                      group_number: true,
                      rank: true,
                      placement: true,
                      wins: true,
                      losses: true,
                      rounds_won: true,
                      rounds_lost: true,
                      maps_won: true,
                      maps_lost: true,
                      matches_played: true,
                      matches_remaining: true,
                      team: {
                        id: true,
                        name: true,
                        team: {
                          id: true,
                          name: true,
                          avatar_url: true,
                          // The real team's roster -- the only place a
                          // team-specific roster image can live. See
                          // graphql/tournamentTeamFields.ts for the same
                          // pattern.
                          roster: [
                            {},
                            {
                              player_steam_id: true,
                              roster_image_url: true,
                            },
                          ],
                        },
                        roster: [
                          {},
                          {
                            player_steam_id: true,
                            role: true,
                            ...rosterImageSnapshotField,
                            player: playerFields,
                          },
                        ],
                      },
                    },
                  ],
                  brackets: [
                    {
                      order_by: [
                        {
                          round: order_by.asc,
                        },
                        {
                          group: order_by.asc,
                        },
                        {
                          path: order_by.desc,
                        },
                        {
                          match_number: order_by.asc,
                        },
                      ],
                    },
                    {
                      // Heavy match fields are fetched by TournamentResults.vue.
                      id: true,
                      round: true,
                      group: true,
                      bye: true,
                      match_number: true,
                      scheduled_at: true,
                      scheduled_eta: true,
                      team_1_seed: true,
                      team_2_seed: true,
                      path: true,
                      loser_parent_bracket_id: true,
                      match_options_id: true,
                      options: {
                        best_of: true,
                      },
                      parent_bracket: {
                        id: true,
                        round: true,
                        group: true,
                        match_number: true,
                        path: true,
                      },
                      loser_bracket: {
                        id: true,
                        round: true,
                        group: true,
                        match_number: true,
                        path: true,
                      },
                      feeding_brackets: {
                        id: true,
                        round: true,
                        group: true,
                        match_number: true,
                        path: true,
                        parent_bracket_id: true,
                        loser_parent_bracket_id: true,
                        team_1_seed: true,
                        team_2_seed: true,
                      },
                      match: {
                        id: true,
                        status: true,
                        winning_lineup_id: true,
                        lineup_1_id: true,
                        lineup_2_id: true,
                        options: {
                          best_of: true,
                        },
                        match_maps: [
                          {
                            order_by: [
                              {
                                order: order_by.asc,
                              },
                            ],
                          },
                          {
                            lineup_1_score: true,
                            lineup_2_score: true,
                            winning_lineup_id: true,
                            order: true,
                            status: true,
                          },
                        ],
                        lineup_1: {
                          id: true,
                          name: true,
                          team_id: true,
                        },
                        lineup_2: {
                          id: true,
                          name: true,
                          team_id: true,
                        },
                      },
                      team_1: {
                        id: true,
                        name: true,
                        team_id: true,
                        team: {
                          name: true,
                        },
                      },
                      team_2: {
                        id: true,
                        name: true,
                        team_id: true,
                        team: {
                          name: true,
                        },
                      },
                      // Negotiated scheduling (BracketNegotiation): the same
                      // proposal rows as the league schedule.
                      scheduling_proposals: [
                        { order_by: [{ created_at: order_by.desc }] },
                        {
                          id: true,
                          proposed_time: true,
                          status: true,
                          message: true,
                          proposed_by_steam_id: true,
                          proposed_by: { steam_id: true, name: true },
                        },
                      ],
                      created_at: true,
                    },
                  ],
                },
              ],
            },
          ],
        }),
        variables: function () {
          return {
            tournamentId: this.$route.params.tournamentId,
          };
        },
        result: function ({ data }) {
          this.tournament = data.tournaments_by_pk;
          this.tournamentLoadError = false;
          const ctx = useTournamentContext();
          if (this.tournament) {
            const existing = ctx.value;
            ctx.value = {
              id: this.tournament.id,
              name: this.tournament.name,
              isOrganizer: !!this.tournament.is_organizer,
              // Preserve any participant flag that may have been set from myTeam.
              isParticipant: existing?.isParticipant ?? !!this.myTeam,
            };
          } else {
            ctx.value = null;
          }
        },
        // Without this, a query/permission error leaves `tournament` unset
        // forever and the page silently renders nothing (the only template
        // gate is `v-if="tournament"`) instead of a visible error state.
        error: function () {
          this.tournamentLoadError = true;
        },
      },
      tournament_teams: {
        query: typedGql("subscription")({
          tournament_teams: [
            {
              where: {
                tournament_id: {
                  _eq: $("tournamentId", "uuid!"),
                },
                _or: [
                  {
                    owner_steam_id: {
                      _eq: $("steam_id", "bigint!"),
                    },
                  },
                  {
                    roster: {
                      player_steam_id: {
                        _eq: $("steam_id", "bigint!"),
                      },
                    },
                  },
                ],
              },
            },
            Object.assign({}, tournamentTeamFields, {
              invites: [
                {},
                {
                  id: true,
                  player: playerFields,
                },
              ],
            }),
          ],
        }),
        variables: function () {
          return {
            steam_id: this.me?.steam_id,
            tournamentId: this.$route.params.tournamentId,
          };
        },
        skip: function () {
          return !this.me?.steam_id;
        },
        result: function ({ data }) {
          this.myTeam = data.tournament_teams?.[0];
          this.myTeamLoaded = true;
          const ctx = useTournamentContext();
          if (
            ctx.value &&
            this.tournament &&
            ctx.value.id === this.tournament.id
          ) {
            ctx.value = {
              ...ctx.value,
              isParticipant: !!this.myTeam,
            };
          }
        },
      },
    },
  },
  computed: {
    manageSection() { return tournamentManageSection(this.$route.query.section); },
    // Chat Hub's own list of tournaments this viewer may chat in; the
    // Chat Room tab only exists while this tournament is in it.
    chatRoomTournament() {
      return findChatTournament(
        useMatchLobbyStore().chatTournaments,
        this.tournament?.id,
      );
    },
    // The Chat Hub's existing unread count for this room, not a copy.
    chatRoomUnreadLabel() {
      if (!this.chatRoomTournament) return "";
      return formatChatRoomUnread(
        useChatTabs().unreadCounts.value[
          tournamentChatTabId(this.chatRoomTournament.id)
        ],
      );
    },
    apiDomain() {
      return useRuntimeConfig().public.apiDomain;
    },
    leagueSeasonId() {
      return this.$route.params.seasonId ?? null;
    },
    // Once teams have actually been generated (or, for an org that toggled
    // this off after already having teams, whenever any exist), fall back
    // to the normal team grid -- individual sign-up is purely a
    // registration-time mechanism, not an ongoing display mode.
    isUnifiedRegistration() { return this.tournament?.registration_version === 2; },
    myFreeAgent() {
      return (this.tournament?.free_agents ?? []).find((agent: any) => String(agent.player_steam_id) === String(this.me?.steam_id) && agent.status !== 'withdrawn') ?? null;
    },
    isIndividualRegistration() {
      return (
        !this.isUnifiedRegistration &&
        !!this.tournament?.options?.individual_registration_enabled &&
        (this.tournament?.teams_aggregate?.aggregate?.count || 0) === 0
      );
    },
    registeredIndividualSignups() {
      return (this.tournament?.individual_signups ?? []).filter(
        (signup: any) => signup.status !== "Removed",
      );
    },
    myIndividualSignup() {
      const steamId = String(this.me?.steam_id ?? "");
      if (!steamId) return null;
      return (
        (this.tournament?.individual_signups ?? []).find(
          (signup: any) =>
            String(signup.player_steam_id) === steamId &&
            (signup.status === "Registered" || signup.status === "Waitlisted"),
        ) ?? null
      );
    },
    checkInCurrentlyActive() {
      const endsAt = this.tournament?.individual_check_in_ends_at;
      return !!endsAt && new Date(endsAt) > new Date();
    },
    // Shared with the player-row Leave action, mirroring what
    // removeTournamentIndividualPlayer enforces server-side.
    canLeaveIndividually() {
      return canLeaveIndividualTournament(
        this.myIndividualSignup as any,
        this.tournament as any,
      );
    },
    canGenerateTeams() {
      return (
        !this.isUnifiedRegistration &&
        this.tournament?.is_organizer &&
        !!this.tournament?.options?.individual_registration_enabled &&
        this.tournament?.status === e_tournament_status_enum.RegistrationClosed
      );
    },
    tournamentLogoSrc() {
      if (!this.tournament?.logo) {
        return null;
      }
      return `https://${useRuntimeConfig().public.apiDomain}/${this.tournament.logo}`;
    },
    tournamentBannerSrc() {
      if (!this.tournament?.banner) {
        return null;
      }
      return `https://${useRuntimeConfig().public.apiDomain}/${this.tournament.banner}`;
    },
    tournamentCategories() {
      return (this.tournament?.categories ?? []).map((category) => {
        return category.e_tournament_category?.description ?? category.category;
      });
    },
    // Only a meaningful external site: never deafcs.net (or this site)
    // itself, and never a non-http(s) or credential-carrying URL.
    tournamentHomepage() {
      return externalTournamentHomepage(
        this.tournament?.homepage,
        import.meta.client ? window.location.hostname : null,
      );
    },
    showSeparators() {
      return useApplicationSettingsStore().showSeparators;
    },
    me() {
      return useAuthStore().me;
    },
    canDeleteTournament() {
      if (!this.tournament || !this.me) return false;
      return (
        useAuthStore().isAdmin ||
        String(this.tournament.organizer_steam_id) === String(this.me.steam_id)
      );
    },
    tournamentTypeDescription() {
      if (!this.tournament?.options?.type || !this.e_match_types) {
        return this.tournament?.options?.type || "";
      }
      const matchType = this.e_match_types.find(
        (type) => type.value === this.tournament.options.type,
      );
      return matchType?.description || this.tournament.options.type;
    },
    organizersList() {
      if (!this.tournament) return [];
      const list = [];
      if (this.tournament.admin) {
        list.push(this.tournament.admin);
      }
      if (this.tournament.organizers) {
        this.tournament.organizers.forEach((item) => {
          if (item.organizer) {
            list.push(item.organizer);
          }
        });
      }
      return list;
    },
    stageCount() {
      return this.tournament?.stages?.length || 0;
    },
    singleStageType() {
      if (
        this.stageCount === 1 &&
        this.tournament?.stages?.[0]?.e_tournament_stage_type
      ) {
        return this.tournament.stages[0].e_tournament_stage_type.description;
      }
      return null;
    },
    singleStageTypeWithBestOf() {
      if (!this.singleStageType) return null;

      const stage = this.tournament?.stages?.[0];
      if (!stage) return this.singleStageType;

      let bestOf: number | null = null;
      if (stage.default_best_of) {
        bestOf = stage.default_best_of;
      } else if (stage.options?.best_of) {
        bestOf = stage.options.best_of;
      } else if (this.tournament?.options?.best_of) {
        bestOf = this.tournament.options.best_of;
      }

      if (bestOf) {
        return `${this.singleStageType} - BO${bestOf}`;
      }

      return this.singleStageType;
    },
    prizePool() {
      return formatPrizePool(this.tournament?.prizes);
    },
    shortLocation() {
      const loc = this.tournament?.location;
      if (!loc) {
        return null;
      }
      // Keep the readable address parts ("Sandberg, Colmberg, Bavaria,
      // Germany"), dropping only postal-code segments.
      const parts = loc
        .split(",")
        .map((part: string) => part.trim())
        .filter((part: string) => part && !/^\d[\d\s-]*$/.test(part));
      return parts.length > 0 ? parts.join(", ") : loc;
    },
    descLong() {
      return (this.tournament?.description?.length ?? 0) > 280;
    },
    // Effective substitute slots (0 when turned off or for a Duel), from the
    // same capacity the API enforces.
    // Matches exist once the draw is published (RegistrationClosed) and
    // stay listed through Live, Paused and Finished (5Stack shows the tab
    // from Live; DEAFCS also publishes the draw before the start).
    matchesTabVisible() {
      const status = this.tournament?.status;
      return [
        e_tournament_status_enum.RegistrationClosed,
        e_tournament_status_enum.Live,
        e_tournament_status_enum.Paused,
        e_tournament_status_enum.Finished,
      ].includes(status);
    },
    tournamentEffectiveSubstitutes() {
      const max = this.tournament?.max_players_per_lineup;
      const min = this.tournament?.min_players_per_lineup;
      if (typeof max !== "number" || typeof min !== "number") return null;
      return Math.max(0, max - min);
    },
    teamsCount() {
      return this.tournament?.teams_aggregate?.aggregate?.count ?? 0;
    },
    formatLabel() {
      if (this.singleStageTypeWithBestOf) {
        return this.singleStageTypeWithBestOf;
      }
      if (this.stageCount > 1) {
        return `${this.stageCount} ${this.$t("tournament.stage.stages")}`;
      }
      return this.tournament?.options?.type ?? null;
    },
    e_tournament_status_enum() {
      return e_tournament_status_enum;
    },
    tournamentHasStarted() {
      const status = this.tournament?.status;
      if (!status) return false;
      return ![
        e_tournament_status_enum.Setup,
        e_tournament_status_enum.RegistrationOpen,
        e_tournament_status_enum.RegistrationClosed,
      ].includes(status);
    },
    visibleTeams() {
      const teams = this.tournament?.teams || [];
      if (!this.tournamentHasStarted) return teams;
      return teams.filter((team) => !!team.eligible_at);
    },
    statusTier() {
      const s = this.tournament?.status;
      if (s === e_tournament_status_enum.Live) return "live";
      if (s === e_tournament_status_enum.RegistrationOpen) return "open";
      if (
        s === e_tournament_status_enum.RegistrationClosed ||
        s === e_tournament_status_enum.Setup
      ) {
        return "pending";
      }
      if (s === e_tournament_status_enum.Paused) return "paused";
      if (s === e_tournament_status_enum.Finished) return "finished";
      if (
        s === e_tournament_status_enum.Cancelled ||
        s === e_tournament_status_enum.CancelledMinTeams
      ) {
        return "ended";
      }
      return "neutral";
    },
    availableTournamentTabs() {
      const tabs = ["overview"];

      if (this.myTeam) {
        tabs.push("my-team");
      }

      tabs.push("bracket");

      if (this.matchesTabVisible) {
        tabs.push("matches");
      }

      tabs.push("teams");
      if (this.isUnifiedRegistration && this.tournament.registration_type !== "teams") {
        tabs.push("free-agents");
      }

      // No public "Tournament Settings" tab: its panel was blank for
      // organizers, and the rules already sit in Overview (Match Setup).
      // Administrative settings live in Manage.

      if (this.standingsTabVisible) {
        tabs.push("standings");
      }

      if (this.statsTabVisible) {
        tabs.push("stats");
      }


      return tabs;
    },
    publicTabs() {
      const labels: Record<string, string> = {
        overview: this.$t("tournament.overview"),
        "my-team": this.$t("tournament.teams.my_teams"),
        bracket: this.$t("tournament.page.bracket_tab"),
        matches: this.$t("tournament.page.matches_tab"),
        teams: this.isIndividualRegistration
          ? this.$t("tournament.players.count", {
              count: this.registeredIndividualSignups.length,
            })
          : this.$t("tournament.teams.count", {
              count: this.tournament?.teams_aggregate?.aggregate?.count || 0,
            }),
        "free-agents": this.$t("tournament.free_agents.title"),
        standings: this.$t("tournament.standings.title"),
        stats: this.$t("tournament.stats_tab.title"),
      };
      return this.availableTournamentTabs.map((tab: string) => ({
        value: tab,
        label: labels[tab] ?? tab,
      }));
    },
    hasStatusActions() {
      const t = this.tournament;
      if (!t) return false;
      return !!(
        t.can_open_registration ||
        t.can_close_registration ||
        this.canGenerateTeams ||
        t.can_start ||
        t.can_pause ||
        t.can_resume ||
        (t.can_setup && !this.leagueSeasonId) ||
        (!this.leagueSeasonId &&
          (t.can_cancel ||
            (this.canDeleteTournament &&
              t.status !== e_tournament_status_enum.Live)))
      );
    },
    standingsTabVisible() {
      const status = this.tournament?.status;
      return (
        status === e_tournament_status_enum.Live ||
        status === e_tournament_status_enum.Paused ||
        status === e_tournament_status_enum.Finished
      );
    },
    // Reuses the same status gate as Standings rather than an async
    // "does any stat row exist yet" check: that would require a
    // query/aggregate round-trip to decide tab *visibility* itself, which
    // risks the tab appearing/disappearing out from under
    // syncActiveTabFromRoute (e.g. a ?tab=stats deep link resolving before
    // the existence check returns). TournamentStats.vue instead renders its
    // own "No stats yet" empty state when the leaderboard comes back empty,
    // which avoids that race without showing an empty tab throughout
    // Setup/RegistrationOpen/RegistrationClosed.
    statsTabVisible() {
      return this.standingsTabVisible;
    },
  },
  methods: {
    // A history entry per section so Back/Forward walk the console. The page
    // key ignores ?section= (manage.vue persistQueryKeys), so this only swaps
    // the section content; the shell and sidebar stay mounted.
    setManageSection(section: string) {
      const next = tournamentManageSection(section);
      if (this.$route.query.section === next) return;
      void this.$router.push({ query: { ...this.$route.query, section: next } });
    },
    openChatRoom() {
      if (!this.chatRoomTournament) return;
      openTournamentChatRoom(this.chatRoomTournament);
    },
    // Current identity avatar for the "Organized by" trigger icon -- same
    // custom_avatar_url -> avatar_url priority PlayerDisplay already uses
    // internally (confirmed correct in the popover just below this trigger,
    // which renders <PlayerDisplay :player="organizer">). This is a normal
    // identity context, not a team/tournament roster context -- no roster
    // image involved.
    organizerAvatarSrc(organizer: any): string | null {
      return resolveAvatarUrl(
        organizer?.custom_avatar_url || organizer?.avatar_url,
        this.apiDomain,
      );
    },
    syncActiveTabFromRoute() {
      if (!this.tournament) {
        return;
      }

      if (this.manageMode) return;
      const requestedTab = getRequestedRouteTab(this.$route.query);
      // The separate Results tab is gone: finished matches live under
      // Matches -> Results (current 5Stack). Old ?tab=results links land there.
      if (requestedTab === "results") {
        if (this.availableTournamentTabs.includes("matches")) {
          this.activeTab = "matches";
          void replaceRouteTab(this.$router, this.$route, "matches", "overview");
        }
        return;
      }
      const section = legacyTournamentManageSections[requestedTab as string];
      if (section && this.tournament.is_organizer) {
        void this.$router.replace({ path: `/tournaments/${this.tournament.id}/manage`, query: { section } });
        return;
      }
      if (requestedTab === "my-team" && this.me && !this.myTeamLoaded) {
        return;
      }

      const activeTab = getRouteTabValue(
        this.$route,
        this.availableTournamentTabs,
        "overview",
      );

      if (this.activeTab !== activeTab) {
        this.activeTab = activeTab;
      }

      void normalizeRouteTab(
        this.$router,
        this.$route,
        this.availableTournamentTabs,
        "overview",
      );
    },
    openSettingsDialog() {
      this.settingsDialogOpen = true;
    },
    openOrganizersDialog() {
      this.organizersDialogOpen = true;
    },
    // Shared entry point for both hero registration actions (team and
    // individual). Always opens the sheet rather than redirecting guests
    // away -- TournamentJoinForm is the single source of truth for the
    // guest/min-role messaging, so it decides what to show inside.
    handleJoinTournament() {
      this.joinSheetOpen = true;
    },
    async cancelTournament() {
      await this.updateTournamentStatus(e_tournament_status_enum.Cancelled);
    },
    async resetToSetup() {
      await this.updateTournamentStatus(e_tournament_status_enum.Setup);
    },
    async startTournament() {
      await this.updateTournamentStatus(e_tournament_status_enum.Live);
    },
    async openRegistration() {
      await this.updateTournamentStatus(
        e_tournament_status_enum.RegistrationOpen,
      );
    },
    async leaveIndividually() {
      if (this.individualActionBusy || !this.myIndividualSignup) return;
      this.individualActionBusy = true;
      try {
        // The canonical action, same as the player-row Leave, so the cutoff
        // and finalization guards are enforced in one place rather than
        // relying on a direct delete permission.
        await this.$apollo.mutate({
          mutation: generateMutation({
            removeTournamentIndividualPlayer: [
              {
                tournament_id: this.tournament.id,
                player_steam_id: String(
                  this.myIndividualSignup.player_steam_id,
                ),
              },
              { success: true, was_self: true },
            ],
          }),
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: (error as Error).message,
        });
      } finally {
        this.individualActionBusy = false;
      }
    },
    async generateTeams() {
      try {
        const { data } = await this.$apollo.mutate({
          mutation: generateMutation({
            generateTournamentTeams: [
              { tournament_id: this.tournament.id },
              { teamsCreated: true, waitlisted: true },
            ],
          }),
        });
        const result = data?.generateTournamentTeams;
        toast({
          title: this.$t("tournament.actions.generate_teams_success", {
            teams: result?.teamsCreated ?? 0,
            waitlisted: result?.waitlisted ?? 0,
          }),
        });
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: this.$t("tournament.actions.generate_teams_failed"),
          description: (error as Error).message,
        });
      }
    },
    async closeRegistration() {
      await this.updateTournamentStatus(
        e_tournament_status_enum.RegistrationClosed,
      );
    },
    async pauseTournament() {
      await this.updateTournamentStatus(e_tournament_status_enum.Paused);
      this.pauseDialogOpen = false;
    },
    async resumeTournament() {
      await this.updateTournamentStatus(e_tournament_status_enum.Live);
      this.resumeDialogOpen = false;
    },
    async updateTournamentStatus(status: e_tournament_status_enum) {
      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            update_tournaments_by_pk: [
              {
                pk_columns: {
                  id: this.tournament.id,
                },
                _set: {
                  status,
                },
              },
              {
                __typename: true,
              },
            ],
          }),
        });
      } catch (error: unknown) {
        toast({
          title: this.$t("tournament.actions.update_status_failed"),
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    },
    async deleteTournament() {
      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            deleteTournament: [
              {
                tournament_id: this.tournament.id,
              },
              {
                success: true,
              },
            ],
          }),
        });
        toast({
          title: this.$t("tournament.actions.deleted"),
        });
        this.deleteDialogOpen = false;
        this.$router.push({ name: "tournaments" });
      } catch (error: any) {
        toast({
          title: this.$t("tournament.actions.delete_failed"),
          description: error.message,
          variant: "destructive",
        });
      }
    },
  },
  watch: {
    activeTab(newTab) {
      if (this.manageMode || !this.tournament || !this.availableTournamentTabs.includes(newTab)) {
        return;
      }

      void replaceRouteTab(this.$router, this.$route, newTab, "overview");
    },
    "$route.query.tab"() {
      this.syncActiveTabFromRoute();
    },
    // Public page and Manage console are one mounted page; coming back from
    // Manage re-reads the tab from the URL.
    manageMode() {
      this.syncActiveTabFromRoute();
    },
    availableTournamentTabs() {
      this.syncActiveTabFromRoute();
    },
    tournament: {
      handler(newTournament) {
        if (newTournament) {
          this.syncActiveTabFromRoute();
        }
      },
      immediate: true,
    },
  },
};
</script>
