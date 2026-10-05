<script setup lang="ts">
import { ref } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { generateMutation } from "~/graphql/graphqlGen";
import { Button } from "~/components/ui/button";
import { toast } from "~/components/ui/toast";
const props = defineProps<{ invite: any }>();
const { client } = useApolloClient();
const busy = ref(false);
async function resolve(accept: boolean) {
  if (busy.value) return;
  busy.value = true;
  try {
    const selection = [{ invite_id: props.invite.id, type: "tournament_registration" }, { success: true }];
    await client.mutate({ mutation: generateMutation(accept ? { acceptInvite: selection } : { denyInvite: selection } as any) });
  } catch (error: any) {
    toast({ variant: "destructive", title: "Invitation could not be resolved", description: error.message });
  } finally { busy.value = false; }
}
</script>
<template>
  <article class="grid gap-3 rounded-md border border-border bg-card/60 p-3">
    <NuxtLink :to="`/tournaments/${invite.tournament.id}`" class="font-semibold">{{ invite.tournament.name }}</NuxtLink>
    <p class="text-sm text-muted-foreground">{{ invite.invited_by?.name }} invited {{ invite.team?.name || 'you' }} to register. Entry requirements still apply.</p>
    <div class="flex gap-2">
      <Button :disabled="busy" @click="resolve(true)">Accept</Button>
      <Button :disabled="busy" variant="outline" @click="resolve(false)">Decline</Button>
    </div>
  </article>
</template>
