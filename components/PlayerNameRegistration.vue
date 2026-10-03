<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle } from "lucide-vue-next";
import SettingHeader from "~/components/match/SettingHeader.vue";
</script>

<template>
  <AlertDialog :open="requiredPlayerNameRegistration">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("player.registration.title")
        }}</AlertDialogTitle>
        <AlertDialogDescription class="space-y-4">
          <p>
            {{ $t("player.registration.description") }}
          </p>

          <p
            class="text-red-500 font-medium italic border border-red-300 rounded-md p-3 bg-red-50 flex items-center gap-2"
          >
            <AlertCircle class="w-5 h-5" />
            {{ $t("player.registration.warning") }}
          </p>
        </AlertDialogDescription>
      </AlertDialogHeader>

      <form @submit.prevent="confirmName" class="flex flex-col gap-4">
        <SettingHeader>{{ $t("player.registration.name_label") }}</SettingHeader>

        <FormField v-slot="{ componentField }" name="player_name">
          <FormItem>
            <FormControl>
              <Input v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button variant="tactical" type="submit" :loading="submitting">{{
          $t("player.registration.confirm_button")
        }}</Button>
      </form>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script lang="ts">
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";
import { useForm } from "vee-validate";
import { z } from "zod";
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";
import { $ } from "~/generated/zeus";
import {
  isNameTakenError,
  isPlayerNameAvailable,
  PLAYER_NAME_TAKEN_FALLBACK,
} from "~/utilities/isPlayerNameAvailable";

const NAME_FORMAT = /^[A-Za-z0-9_-]{3,32}$/;

export default {
  data() {
    return {
      submitting: false,
      nameCheckId: 0,
      nameCheckTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            player_name: z
              .string()
              .min(3)
              .max(32)
              .regex(
                /^[A-Za-z0-9_-]+$/,
                "Name can only contain letters, numbers, - and _",
              ),
          }),
        ),
      }),
    };
  },
  beforeUnmount() {
    clearTimeout(this.nameCheckTimer);
  },
  watch: {
    // Live "already taken" message under the field while typing, for a name
    // that already passes the format rule.
    "form.values.player_name"(name: string | undefined) {
      clearTimeout(this.nameCheckTimer);
      const checkId = ++this.nameCheckId;
      if (!name || !NAME_FORMAT.test(name)) return;
      this.nameCheckTimer = setTimeout(async () => {
        const available = await isPlayerNameAvailable(
          this.$apollo,
          name,
          this.me?.steam_id,
        );
        if (checkId === this.nameCheckId && !available) {
          this.showNameTaken();
        }
      }, 300);
    },
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
    playerNameRegistration() {
      return useApplicationSettingsStore().playerNameRegistration;
    },
    requiredPlayerNameRegistration() {
      return this.me?.name_registered === false;
    },
  },
  methods: {
    showNameTaken() {
      this.form.setFieldError(
        "player_name",
        this.$t("player.name_taken", PLAYER_NAME_TAKEN_FALLBACK),
      );
    },
    async confirmName() {
      if (this.submitting) {
        return;
      }

      const { valid } = await this.form.validate();

      if (!valid) {
        return;
      }

      this.submitting = true;
      try {
        const form = this.form.values;

        // Stopped here (not just by the API) when someone took the name
        // after the last keystroke.
        if (
          !(await isPlayerNameAvailable(
            this.$apollo,
            form.player_name,
            this.me?.steam_id,
          ))
        ) {
          this.showNameTaken();
          return;
        }

        await this.$apollo.mutate({
          variables: {
            name: form.player_name,
          },
          mutation: generateMutation({
            registerName: [
              {
                name: $("name", "String!"),
              },
              {
                success: true,
              },
            ],
          }),
        });

        toast({
          title: this.$t("player.registration.success"),
        });
      } catch (error) {
        // Lost a race with another player: same inline message.
        if (isNameTakenError(error)) {
          this.showNameTaken();
        } else {
          throw error;
        }
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>
