<script lang="ts" setup>
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "~/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import SettingHeader from "~/components/match/SettingHeader.vue";
</script>

<template>
  <form class="space-y-8">
    <FormField v-slot="{ componentField }" name="lineup_id">
      <FormItem class="space-y-1.5">
        <SettingHeader>{{ $t("match.winner.set") }}</SettingHeader>
        <Select v-bind="componentField" @update:modelValue="updateMatchWinner">
          <FormControl>
            <SelectTrigger>
              <SelectValue :placeholder="$t('match.winner.select_lineup')" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectGroup>
              <SelectItem
                v-for="lineup in availableLineups"
                :key="lineup.value"
                :value="lineup.value"
              >
                {{ lineup.display }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    </FormField>
  </form>
</template>

<script lang="ts">
import * as z from "zod";
import { useForm } from "vee-validate";
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";

export default {
  props: {
    match: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      servers: [],
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            lineup_id: z.string().nullable(),
          }),
        ),
      }),
    };
  },
  watch: {
    match: {
      immediate: true,
      handler() {
        this.form.setFieldValue("lineup_id", this.match.winning_lineup_id);
      },
    },
  },
  methods: {
    async updateMatchWinner() {
      const winningLineupId = this.form.values.lineup_id;

      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            setMatchWinner: [
              {
                match_id: this.match.id,
                winning_lineup_id: winningLineupId,
              },
              { success: true },
            ],
          }),
        });
      } catch (error: any) {
        this.form.setFieldValue("lineup_id", this.match.winning_lineup_id);
        toast({
          title: this.$t("toasts.match_winner_update_failed"),
          description: error?.message || this.$t("toasts.please_try_again"),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: this.$t("match.winner.set"),
      });
    },
  },
  computed: {
    availableLineups() {
      return [
        {
          value: this.match.lineup_1.id,
          display: this.match.lineup_1.name,
        },
        {
          value: this.match.lineup_2.id,
          display: this.match.lineup_2.name,
        },
      ];
    },
  },
};
</script>
