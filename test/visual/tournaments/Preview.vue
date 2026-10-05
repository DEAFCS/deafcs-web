<script setup lang="ts">
import { ref } from "vue";
import { useForm } from "vee-validate";
import NextLan from "../../../components/tournament/TournamentNextLan.vue";
import WatchCard from "../../../components/watch/WatchTournamentCard.vue";
import RegistrationForm from "../../../components/tournament/TournamentRegistrationForm.vue";
import CheckInPanel from "../../../components/tournament/TournamentCheckInPanel.vue";
import FreeAgents from "../../../components/tournament/TournamentFreeAgents.vue";
const width = ref(Number(new URLSearchParams(location.search).get("width")) || 1440);
const banner = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="500"><defs><linearGradient id="b"><stop stop-color="#20323f"/><stop offset="1" stop-color="#bc7420"/></linearGradient></defs><rect width="1440" height="500" fill="url(#b)"/><path d="M900 0L1440 300L700 500Z" fill="#101820" opacity=".55"/></svg>');
const stage = { id:"s", order:1, type:"DoubleElimination", max_teams:8, max_rounds:6, e_tournament_stage_type:{description:"Double Elimination"}, brackets: Array.from({length:14},(_,i)=>({id:String(i),round:i<4?1:2,finished:i<4,bye:false,match:{status:i<4?"Finished":i<6?"Live":"Scheduled",winning_lineup_id:i<4?"l1":null}})), results:[{rank:1,team:{name:"Northern Stars"}},{rank:2,team:{name:"Quiet Force"}},{rank:3,team:{name:"Orange Squad"}}] };
const base={id:"local-fixture",name:"DEAFCS Autumn Championship",status:"RegistrationOpen",registration_version:2,registration_type:"free_agents",start:new Date(Date.now()+86400000).toISOString(), e_tournament_status:{description:"Registration open"},options:{type:"Competitive",best_of:3,individual_registration_enabled:true,map_pool:{maps:[{poster:banner}]}},admin:{name:"DEAFCS"},categories:[{category:"OnlineEvent",e_tournament_category:{description:"Online event"}}],teams_aggregate:{aggregate:{count:0}},free_agents_aggregate:{aggregate:{count:27}},stages:[stage],prizes:[{prize:"€250"}],is_organizer:false,check_in_required:true,check_in_setting:"Players",check_in_open:true,check_in_started:true,check_in_ends_at:new Date(Date.now()+900000).toISOString(),min_players_per_lineup:5,max_players_per_lineup:7};
const form=useForm({initialValues:{type:"Competitive",individual_registration_enabled:true,registration_type:"free_agents",min_role:"verified_user",min_elo:4000,max_elo:8000,invite_only:false,check_in_required:true,team_check_in_setting:"Players",check_in_opens_before_minutes:60,check_in_closes_before_minutes:15,start:new Date(base.start)}});
</script>
<template>
  <nav class="sticky top-0 z-50 flex flex-wrap gap-2 border-b border-border bg-background p-3"><strong>LOCAL COMPONENT FIXTURES</strong><button v-for="w in [1440,1280,768,375]" :key="w" class="rounded border border-border px-3" @click="width=w">{{ w }}px</button></nav>
  <main class="mx-auto grid gap-8 p-4 sm:p-6" :style="{width:width+'px',maxWidth:'100%'}">
    <NextLan :tournament="base" hero />
    <div class="grid gap-4 lg:grid-cols-2"><WatchCard :tournament="{...base,status:'Live',e_tournament_status:{description:'Live'},teams_aggregate:{aggregate:{count:8}}}" /><WatchCard :tournament="{...base,status:'Finished',e_tournament_status:{description:'Finished'}}" /></div>
    <WatchCard :tournament="{...base,status:'Paused'}" />
    <CheckInPanel :tournament="base" :registration="base" :my-free-agent="{status:'registered',checked_in_at:null}" :teams="[]" />
    <FreeAgents :tournament="base" />
    <section class="rounded-lg border border-border p-4"><h2 class="mb-6 text-xl font-bold">Random registration settings</h2><RegistrationForm :form="form" :min-players-per-lineup="5" /></section>
  </main>
</template>
