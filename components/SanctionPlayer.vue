<script setup lang="ts">
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
  DrawerDescription,
} from "~/components/ui/drawer";
import { Button } from "~/components/ui/button";
import {
  MicOff,
  MessageSquareOff,
  BellOff,
  Ban,
  TriangleAlert,
} from "lucide-vue-next";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { z } from "zod";
import { useForm } from "vee-validate";
import gql from "graphql-tag";
import SettingHeader from "~/components/match/SettingHeader.vue";
import { e_player_roles_enum } from "~/generated/zeus";
</script>

<template>
  <Popover v-if="showTrigger">
    <PopoverTrigger as-child>
      <button
        type="button"
        :title="$t('player.sanction.button')"
        :aria-label="$t('player.sanction.button')"
        class="group/sanction inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-red-500/45 bg-red-500/10 text-red-400 transition-[border-color,background-color,color,box-shadow] duration-150 hover:border-red-500/80 hover:bg-red-500/20 hover:text-red-200 hover:shadow-[0_0_0_1px_rgb(239_68_68_/_0.35),0_6px_18px_-6px_rgb(239_68_68_/_0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Ban class="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="p-0" align="end">
      <Command v-model="sanctionType">
        <CommandList>
          <CommandGroup>
            <template v-for="(sanction, type) in sanctions" :key="type">
              <CommandItem
                :value="type"
                @click="sanctioningPlayer = true"
                class="flex flex-col items-start px-4 py-2 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <component :is="sanction.icon" class="h-4 w-4" />
                  <span class="font-medium">{{ sanction.label }}</span>
                </div>
                <p class="text-sm text-muted-foreground mt-1">
                  {{ sanction.description }}
                </p>
              </CommandItem>
            </template>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>

  <Drawer :open="sanctioningPlayer" @update:open="sanctioningPlayer = $event">
    <DrawerContent class="p-4">
      <DrawerHeader>
        <div class="flex justify-between items-center">
          <DrawerTitle class="capitalize flex flex-col gap-4">
            {{ sanctions[sanctionType]?.actionLabel }}
            <PlayerDisplay :player="player" />
          </DrawerTitle>
          <DrawerClose>
            <Button variant="link" class="text-lg text-blue-500">
              {{ $t("common.cancel") }}
            </Button>
          </DrawerClose>
        </div>

        <Separator class="my-2" />

        <DrawerDescription
          class="text-lg flex gap-4 items-center text-red-500"
          v-if="sanctionType"
        >
          <component :is="sanctions[sanctionType].icon" class="h-4 w-4" />
          {{ sanctions[sanctionType].description }}
        </DrawerDescription>

        <div
          v-if="serverId && sanctionType && sanctionType !== 'ban'"
          class="flex gap-2 items-start text-sm text-yellow-500"
        >
          <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
          {{ $t("pages.dedicated_servers.detail.sanctions_wip") }}
        </div>

        <Separator class="my-2" />
      </DrawerHeader>

      <form @submit.prevent="sanctionPlayer" class="grid grid-cols-2 gap-4 p-4">
        <SettingHeader class="col-span-2">
          {{ $t("player.sanction.button") }}
        </SettingHeader>

        <FormField v-slot="{ componentField }" name="reason">
          <FormItem>
            <FormLabel>{{ $t("player.sanction.reason_label") }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :placeholder="$t('player.sanction.reason_placeholder')"
              ></Input>
            </FormControl>
            <FormDescription>
              {{ $t("player.sanction.reason_description") }}
            </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="duration">
          <FormItem>
            <FormLabel>{{ $t("player.sanctions.duration_label") }}</FormLabel>
            <FormControl>
              <Select v-bind="componentField">
                <SelectTrigger>
                  <SelectValue
                    :placeholder="$t('player.sanctions.select_duration')"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    :value="duration.duration.toString()"
                    v-for="duration in durations"
                    >{{ duration.label }}</SelectItem
                  >
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button
          variant="tactical"
          class="col-span-2 capitalize"
          type="submit"
          :loading="submitting"
        >
          {{ $t("player.sanction.typed_player", { type: sanctionType }) }}
        </Button>
      </form>
    </DrawerContent>
  </Drawer>
</template>

<script lang="ts">
import { toast } from "@/components/ui/toast";

export default {
  props: {
    player: {
      required: true,
      type: Object,
    },
    serverId: {
      required: false,
      type: String,
      default: undefined,
    },
    showTrigger: {
      type: Boolean,
      default: true,
    },
    initialType: {
      type: String,
      required: false,
      default: undefined,
    },
    evidenceMessageId: {
      type: String,
      required: false,
      default: undefined,
    },
  },
  emits: ["sanctioned"],
  data() {
    return {
      submitting: false,
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            reason: z.string().min(1),
            duration: z.string().min(1),
          }),
        ),
      }),
      sanctionType: undefined as string | undefined,
      sanctioningPlayer: false,
    };
  },
  computed: {
    isSiteAdministrator() {
      return useAuthStore().isRoleAbove(e_player_roles_enum.administrator);
    },
    sanctions(): Record<
      string,
      { icon: any; label: string; actionLabel: string; description: string }
    > {
      const sanctions: Record<
        string,
        { icon: any; label: string; actionLabel: string; description: string }
      > = {
        ban: {
          icon: Ban,
          label: this.$t("player.sanction.types.ban", "Ban"),
          actionLabel: this.$t("player.sanction.actions.ban", "Ban Player"),
          description: this.$t("player.sanction.types.ban_description"),
        },
        mute: {
          icon: MicOff,
          label: this.$t("player.sanction.types.mute", "CS2 Mute"),
          actionLabel: this.$t("player.sanction.actions.mute", "Mute Player"),
          description: this.$t("player.sanction.types.mute_description"),
        },
        gag: {
          icon: MessageSquareOff,
          label: this.$t("player.sanction.types.gag", "CS2 Gag"),
          actionLabel: this.$t("player.sanction.actions.gag", "Gag Player"),
          description: this.$t("player.sanction.types.gag_description"),
        },
        silence: {
          icon: BellOff,
          label: this.$t("player.sanction.types.silence", "CS2 Silence"),
          actionLabel: this.$t(
            "player.sanction.actions.silence",
            "Silence Player",
          ),
          description: this.$t("player.sanction.types.silence_description"),
        },
      };
      if (this.isSiteAdministrator) {
        sanctions.website_chat_mute = {
          icon: MessageSquareOff,
          label: this.$t(
            "player.sanction.types.website_chat_mute",
            "Website Chat Mute",
          ),
          actionLabel: this.$t(
            "player.sanction.actions.website_chat_mute",
            "Mute Player from Website Chat",
          ),
          description: this.$t(
            "player.sanction.types.website_chat_mute_description",
            "Player can read website chat but cannot send messages",
          ),
        };
      }
      return sanctions;
    },
    durations(): Array<{ label: string; duration: number }> {
      return [
        {
          label: this.$t("player.sanction.durations.15_minutes"),
          duration: 1000 * 60 * 15,
        },
        {
          label: this.$t("player.sanction.durations.30_minutes"),
          duration: 1000 * 60 * 30,
        },
        {
          label: this.$t("player.sanction.durations.1_hour"),
          duration: 1000 * 60 * 60,
        },
        {
          label: this.$t("player.sanction.durations.1_day"),
          duration: 1000 * 60 * 60 * 24,
        },
        {
          label: this.$t("player.sanction.durations.1_week"),
          duration: 1000 * 60 * 60 * 24 * 7,
        },
        {
          label: this.$t("player.sanction.durations.1_month"),
          duration: 1000 * 60 * 60 * 24 * 30,
        },
        { label: this.$t("player.sanction.durations.permanent"), duration: 0 },
      ];
    },
  },
  methods: {
    openSanction(type = this.initialType) {
      if (!type || !this.sanctions[type]) {
        return;
      }
      this.sanctionType = type;
      this.sanctioningPlayer = true;
    },
    async sanctionPlayer() {
      if (this.submitting) {
        return;
      }

      if (!this.sanctionType) {
        return;
      }

      this.submitting = true;
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation SanctionServerPlayer(
              $serverId: String
              $steam_id: String!
              $type: String!
              $reason: String
              $duration: Float
              $evidence_message_id: String
            ) {
              sanctionServerPlayer(
                serverId: $serverId
                steam_id: $steam_id
                type: $type
                reason: $reason
                duration: $duration
                evidence_message_id: $evidence_message_id
              ) {
                id
                enforced
                message
              }
            }
          `,
          variables: {
            serverId: this.serverId ?? null,
            steam_id: this.player.steam_id,
            type: this.sanctionType,
            reason: this.form.values.reason,
            duration: this.form.values.duration
              ? parseInt(this.form.values.duration)
              : 0,
            evidence_message_id: this.evidenceMessageId ?? null,
          },
        });

        toast({
          title: `${this.sanctionType}ed ${this.player.name}`,
        });

        this.sanctioningPlayer = false;
        this.$emit("sanctioned");
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>
