<script setup lang="ts">
import { FormControl, FormField, FormItem } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-vue-next";

import {
  tacticalSectionLabelClasses as wizardSectionLabelClasses,
  tacticalSectionTickClasses as wizardSectionTickClasses,
} from "~/utilities/tacticalClasses";
import MatchOptions from "~/components/MatchOptions.vue";
import SettingHeader from "~/components/match/SettingHeader.vue";
import AddressSearch from "~/components/AddressSearch.vue";
import CategorySelect from "~/components/tournament/CategorySelect.vue";
import DateTimePicker from "~/components/tournament/DateTimePicker.vue";
import ImageUploadTile from "~/components/ImageUploadTile.vue";
import PrizeRowsEditor from "~/components/tournament/PrizeRowsEditor.vue";
import TournamentAwardPicker from "~/components/tournament/TournamentAwardPicker.vue";
</script>

<template>
  <div class="grid gap-6">
    <!-- Step indicator -->
    <ol class="flex flex-wrap items-center gap-2">
      <li
        v-for="(step, index) in steps"
        :key="step.key"
        class="flex items-center gap-2"
      >
        <button
          type="button"
          class="flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.16em] transition-colors"
          :class="
            step.disabled
              ? 'cursor-not-allowed border-border/40 bg-background/20 text-muted-foreground/40'
              : index === currentStep
                ? 'border-[hsl(var(--tac-amber))] bg-[hsl(var(--tac-amber)_/_0.12)] text-[hsl(var(--tac-amber))]'
                : index < currentStep
                  ? 'border-border bg-muted/30 text-foreground'
                  : 'border-border bg-background/40 text-muted-foreground'
          "
          :disabled="step.disabled || index > furthestStep"
          :aria-disabled="step.disabled"
          @click="goTo(index)"
        >
          <Check v-if="!step.disabled && index < currentStep" class="h-3 w-3" />
          <span v-else>{{ index + 1 }}</span>
          {{ step.label }}
        </button>
        <ChevronRight
          v-if="index < steps.length - 1"
          class="h-3 w-3 text-muted-foreground/40"
        />
      </li>
    </ol>

    <!-- Step 1: Information -->
    <div v-show="currentStep === 0" class="grid gap-4">
      <div class="grid gap-1.5">
        <Label>{{ $t("tournament.banner.label") }}</Label>
        <ImageUploadTile
          class="max-w-md"
          aspect="banner"
          fit="contain"
          allow-fit-whole
          mode="deferred"
          :hint="$t('tournament.banner.hint')"
          @apply="onBannerApply"
          @removed="onBannerRemoved"
        />
      </div>

      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.name") }}</FormLabel>
          <FormControl>
            <Input v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="homepage">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.homepage.label") }}</FormLabel>
          <FormControl>
            <Input v-bind="componentField" type="url" placeholder="https://" />
          </FormControl>
          <FormDescription class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{{ $t("tournament.form.homepage.description") }}</span>
            <a
              href="/events/create"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-[hsl(var(--tac-amber))] hover:underline"
            >
              {{ $t("tournament.form.homepage.create_event") }}
              <ExternalLink class="h-3 w-3" />
            </a>
          </FormDescription>
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.description") }}</FormLabel>
          <FormControl>
            <Input v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ value }" name="categories">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.categories.label") }}</FormLabel>
          <CategorySelect
            :model-value="value"
            @update:model-value="
              (categories) => form.setFieldValue('categories', categories)
            "
          />
        </FormItem>
      </FormField>

      <div class="mt-2 grid gap-4 border-t border-border pt-4">
        <div :class="[wizardSectionLabelClasses, 'mb-0']">
          <span :class="wizardSectionTickClasses"></span>
          {{ $t("tournament.form.section.schedule") }}
        </div>

        <FormField v-slot="{ value }" name="start">
          <FormItem>
            <FormLabel>{{ $t("tournament.form.start") }}</FormLabel>
            <FormControl>
              <DateTimePicker
                disable-past-dates
                :model-value="value"
                @update:model-value="
                  (date) => form.setFieldValue('start', date)
                "
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <FormField v-slot="{ componentField }" name="attendance_open_before">
            <FormItem>
              <FormLabel>{{
                $t("tournament.form.attendance.open_before")
              }}</FormLabel>
              <FormControl>
                <Input type="number" min="15" max="240" v-bind="componentField" />
              </FormControl>
              <FormDescription>{{
                $t("tournament.form.attendance.open_before_description")
              }}</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="attendance_close_before">
            <FormItem>
              <FormLabel>{{
                $t("tournament.form.attendance.close_before")
              }}</FormLabel>
              <FormControl>
                <Input type="number" min="5" max="60" v-bind="componentField" />
              </FormControl>
              <FormDescription>{{
                $t("tournament.form.attendance.close_before_description")
              }}</FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <p
          v-if="attendanceWindowPreview"
          class="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground"
        >
          {{
            $t("tournament.form.attendance.preview", {
              window: attendanceWindowPreview,
            })
          }}
        </p>
      </div>
    </div>

    <!-- Step 2: Location -->
    <div v-show="currentStep === 1" class="grid gap-4">
      <FormField name="location">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.location.label") }}</FormLabel>
          <FormControl>
            <AddressSearch
              :model-value="form.values.location"
              @selected="onLocationSelected"
              @cleared="onLocationCleared"
            />
          </FormControl>
          <FormDescription>{{
            $t("tournament.form.location.description")
          }}</FormDescription>
        </FormItem>
      </FormField>
    </div>

    <!-- Step 3: Match Options -->
    <div v-show="currentStep === 2" class="grid gap-4">
      <MatchOptions
        :form="form"
        :force-veto="true"
        :hide-best-of="true"
        :hide-match-mode="true"
        :lock-substitutes="true"
        :show-streamer-camera="true"
      >
        <FormField
          v-slot="{ value, handleChange }"
          name="negotiated_scheduling"
        >
          <FormItem>
            <div
              class="flex flex-row items-center justify-between cursor-pointer"
              @click="handleChange(!value)"
            >
              <div class="space-y-0.5">
                <SettingHeader>{{
                  $t("tournament.form.negotiated_scheduling.label")
                }}</SettingHeader>
                <FormDescription>{{
                  $t("tournament.form.negotiated_scheduling.description")
                }}</FormDescription>
              </div>
              <FormControl>
                <Switch
                  class="pointer-events-none"
                  :model-value="value"
                  @update:model-value="handleChange"
                />
              </FormControl>
            </div>
          </FormItem>
        </FormField>

        <FormField
          v-if="!form.values.negotiated_scheduling"
          v-slot="{ value, handleChange }"
          name="auto_start"
        >
          <FormItem>
            <div
              class="flex flex-row items-center justify-between cursor-pointer"
              @click="handleChange(!value)"
            >
              <div class="space-y-0.5">
                <SettingHeader>{{
                  $t("tournament.form.auto_start.label")
                }}</SettingHeader>
                <FormDescription>{{
                  $t("tournament.form.auto_start.description")
                }}</FormDescription>
              </div>
              <FormControl>
                <Switch
                  class="pointer-events-none"
                  :model-value="value"
                  @update:model-value="handleChange"
                />
              </FormControl>
            </div>
          </FormItem>
        </FormField>
      </MatchOptions>
    </div>

    <!-- Step 4: Prizes -->
    <div v-show="currentStep === 3" class="grid gap-4">
      <p class="text-sm text-muted-foreground">
        {{ $t("tournament.prizes.manage_hint") }}
      </p>
      <PrizeRowsEditor
        :rows="prizes"
        @move="movePrizeRow"
        @remove="removePrizeRow"
        @add="addPrizeRow"
      />
    </div>

    <!-- Step 5: Awards -->
    <div v-show="currentStep === 4" class="grid gap-4">
      <TournamentAwardPicker
        ref="awardPicker"
        v-model="awardSelections"
        v-model:trophies-enabled="awardsEnabledPending"
        :match-type="form.values.type || null"
        @ready="awardPickerReady = $event"
      />
    </div>

    <!-- Navigation -->
    <div class="flex items-center justify-between border-t border-border pt-4">
      <Button
        type="button"
        variant="outline"
        :disabled="currentStep === 0 || submitting"
        @click="back"
      >
        <ChevronLeft class="mr-1 h-4 w-4" />
        {{ $t("common.back") }}
      </Button>

      <Button v-if="currentStep < steps.length - 1" type="button" @click="next">
        {{ $t("common.next") }}
        <ChevronRight class="ml-1 h-4 w-4" />
      </Button>
      <Button
        v-else
        type="button"
        :loading="submitting"
        :disabled="submitting || !awardPickerReady"
        @click="create"
      >
        {{ $t("tournament.form.create") }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts">
import * as z from "zod";
import { useForm } from "vee-validate";
import { generateMutation } from "~/graphql/graphqlGen";
import { $ } from "~/generated/zeus";
import matchOptionsValidator from "~/utilities/match-options-validator";
import { effectivePlace, normalizePrize } from "~/utilities/prizes";
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { toast } from "@/components/ui/toast";
import {
  setupOptionsVariables,
  setupOptionsSetMutation,
} from "~/utilities/setupOptions";
import { requiresLocation } from "~/utilities/tournamentCategories";
import { formatAttendanceWindowRange } from "~/utilities/tournamentAttendance";

export default {
  data() {
    return {
      currentStep: 0,
      furthestStep: 0,
      submitting: false,
      prizeRowSeq: 0,
      prizes: [] as Array<{ id: number; place: string; prize: string }>,
      awardSelections: {} as Record<number, string>,
      awardPickerReady: false,
      // Awards are disabled for a new tournament by default (the tournaments
      // table's own default), so this starts false to match. The picker's
      // Awards Enabled switch is usable during create -- see
      // TournamentAwardPicker.vue's toggleAwardsEnabled -- and this is the
      // v-model that carries the organizer's choice until the tournament
      // (and therefore trophies_enabled) exists.
      awardsEnabledPending: false,
      bannerBlob: null as Blob | null,
      form: useForm({
        keepValuesOnUnmount: true,
        // Most organizers run the tournament on this instance, so seed the
        // homepage with its own origin rather than leaving the field blank.
        initialValues: { homepage: useRequestURL().origin },
        validationSchema: toTypedSchema(
          matchOptionsValidator(
            this,
            {
              name: z.string().min(1),
              start: z.date().refine((date) => date > new Date(), {
                message: this.$t("validation.date_must_be_future"),
              }),
              description: z.string().nullable().default(null),
              homepage: z.string().nullable().default(null),
              location: z.string().nullable().default(null),
              latitude: z.number().nullable().default(null),
              longitude: z.number().nullable().default(null),
              categories: z.string().array().default([]),
              auto_start: z.boolean().default(true),
              negotiated_scheduling: z.boolean().default(false),
              min_role: z.string().nullable().default(null),
              // Mirrors TournamentInformationForm.vue and the backend CHECK
              // constraints on tournaments (tournaments_attendance_*):
              // 15-240 / 5-60, and at least a 5-minute gap between them.
              attendance_open_before: z.coerce
                .number()
                .int()
                .min(15)
                .max(240)
                .default(60),
              attendance_close_before: z.coerce
                .number()
                .int()
                .min(5)
                .max(60)
                .default(15),
            },
            useApplicationSettingsStore().settings,
          ).refine(
            (values) =>
              values.attendance_open_before - values.attendance_close_before >=
              5,
            {
              message: this.$t("tournament.form.attendance.invalid_window"),
              path: ["attendance_open_before"],
            },
          ),
        ),
      }),
    };
  },
  computed: {
    // Canonical category IDs only -- LAN and LocationEvent tournaments happen
    // at a physical venue, so Location is required; every other combination
    // (including Online Event, League, or no category yet) does not need it.
    locationRequired() {
      return requiresLocation(this.form.values.categories ?? []);
    },
    steps() {
      return [
        { key: "information", label: this.$t("tournament.wizard.information") },
        {
          key: "location",
          label: this.$t("tournament.wizard.location"),
          disabled: !this.locationRequired,
        },
        {
          key: "match_options",
          label: this.$t("tournament.wizard.match_options"),
        },
        { key: "prizes", label: this.$t("tournament.wizard.prizes") },
        { key: "awards", label: "Awards" },
      ];
    },
    // Same live preview as TournamentInformationForm.vue's schedule section,
    // driven by the form's current values so it updates as the organizer
    // types. Suppressed while the values are out of range.
    attendanceWindowPreview() {
      const start = this.form.values.start;
      const openBefore = Number(this.form.values.attendance_open_before);
      const closeBefore = Number(this.form.values.attendance_close_before);
      if (
        !(start instanceof Date) ||
        Number.isNaN(start.getTime()) ||
        !Number.isFinite(openBefore) ||
        !Number.isFinite(closeBefore) ||
        openBefore - closeBefore < 5
      ) {
        return null;
      }
      return formatAttendanceWindowRange({
        start: start.toISOString(),
        attendance_check_in_open_before_minutes: openBefore,
        attendance_check_in_close_before_minutes: closeBefore,
      });
    },
  },
  methods: {
    addPrizeRow(prize: string, place: string) {
      this.prizes.push({ id: ++this.prizeRowSeq, place, prize });
    },
    removePrizeRow(row: { id: string | number }) {
      this.prizes = this.prizes.filter((prize) => prize.id !== row.id);
    },
    movePrizeRow(from: number, to: number) {
      const [moved] = this.prizes.splice(from, 1);
      this.prizes.splice(to, 0, moved);
    },
    // The ImageUploadTile (deferred mode) crops and previews the banner; we just
    // hold the resulting blob until the tournament exists.
    onBannerApply(blob: Blob) {
      this.bannerBlob = blob;
    },
    onBannerRemoved() {
      this.bannerBlob = null;
    },
    // The banner endpoint keys off the tournament id, so the crop is captured
    // during setup and uploaded once the tournament row exists.
    async uploadBanner(tournamentId: string) {
      if (!this.bannerBlob) {
        return;
      }
      try {
        const formData = new FormData();
        formData.append("file", this.bannerBlob, "banner.webp");
        const response = await fetch(
          `https://${useRuntimeConfig().public.apiDomain}/avatars/tournaments/${tournamentId}/banner`,
          { method: "POST", body: formData, credentials: "include" },
        );
        if (!response.ok) {
          throw new Error(
            (await response.text()) ||
              `${response.status} ${response.statusText}`,
          );
        }
      } catch (error: any) {
        // Non-fatal: the tournament is already created, so surface the failure
        // but let the redirect proceed — the banner can be added from settings.
        toast({
          variant: "destructive",
          title: this.$t("tournament.banner.upload_failed"),
          description: error?.message,
        });
      }
    },
    onLocationSelected(result: {
      label: string;
      latitude: number;
      longitude: number;
    }) {
      this.form.setValues({
        location: result.label,
        latitude: result.latitude,
        longitude: result.longitude,
      });
    },
    onLocationCleared() {
      this.form.setValues({
        location: null,
        latitude: null,
        longitude: null,
      });
    },
    async validateStep(step: number): Promise<boolean> {
      // Only the Information step has required fields; the rest have defaults.
      if (step !== 0) {
        return true;
      }
      const results = await Promise.all([
        this.form.validateField("name"),
        this.form.validateField("start"),
        this.form.validateField("attendance_open_before"),
        this.form.validateField("attendance_close_before"),
      ]);
      return results.every((result) => result.valid);
    },
    // Location (step 1) is skipped in both directions when the selected
    // categories don't require a physical venue -- see `locationRequired`.
    // Step numbering itself never changes: a skipped step is still shown,
    // just disabled, so the visible "2 LOCATION" label stays put.
    nextEnabledStep(from: number): number {
      let step = from;
      while (step < this.steps.length - 1 && this.steps[step].disabled) {
        step++;
      }
      return step;
    },
    previousEnabledStep(from: number): number {
      let step = from;
      while (step > 0 && this.steps[step].disabled) {
        step--;
      }
      return step;
    },
    async next() {
      if (!(await this.validateStep(this.currentStep))) {
        return;
      }
      const target = this.nextEnabledStep(
        Math.min(this.currentStep + 1, this.steps.length - 1),
      );
      this.currentStep = Math.min(target, this.steps.length - 1);
      this.furthestStep = Math.max(this.furthestStep, this.currentStep);
    },
    back() {
      const target = this.previousEnabledStep(
        Math.max(this.currentStep - 1, 0),
      );
      this.currentStep = Math.max(target, 0);
    },
    async goTo(step: number) {
      if (this.steps[step]?.disabled) {
        return;
      }
      if (step > this.furthestStep) {
        return;
      }
      if (
        step > this.currentStep &&
        !(await this.validateStep(this.currentStep))
      ) {
        return;
      }
      this.currentStep = step;
    },
    async create() {
      if (this.submitting) {
        return;
      }
      this.submitting = true;
      try {
        const { valid, errors } = await this.form.validate();
        if (!valid) {
          toast({
            variant: "destructive",
            title: this.$t("common.error"),
            description: Object.values(errors ?? {})[0] as string,
          });
          this.submitting = false;
          return;
        }

        this.form.setFieldValue(
          "number_of_substitutes",
          useApplicationSettingsStore().teamMaxSubs,
        );
        if (this.form.values.negotiated_scheduling) {
          this.form.setFieldValue("match_mode", "admin");
        }
        const form = this.form.values;
        // A category set that doesn't require a physical venue (e.g. Online
        // Event) must not submit stale address data left over from an
        // earlier LAN/Location Event selection. The values themselves stay
        // in form state untouched, so switching categories back restores
        // them -- only the submitted payload is affected.
        const locationEnabled = requiresLocation(form.categories ?? []);

        const { data } = await this.$apollo.mutate({
          variables: setupOptionsVariables(form),
          mutation: generateMutation({
            insert_tournaments_one: [
              {
                object: {
                  name: form.name,
                  start: form.start,
                  description: form.description,
                  homepage: form.homepage || null,
                  location: locationEnabled ? form.location || null : null,
                  latitude: locationEnabled ? form.latitude ?? null : null,
                  longitude: locationEnabled ? form.longitude ?? null : null,
                  min_role: form.min_role ?? null,
                  auto_start: form.negotiated_scheduling
                    ? false
                    : form.auto_start,
                  scheduling_mode: form.negotiated_scheduling
                    ? "negotiated"
                    : "auto",
                  options: {
                    data: setupOptionsSetMutation(!!form.map_pool_id),
                  },
                },
              },
              { id: true },
            ],
          }),
        });

        const tournamentId = data.insert_tournaments_one.id;
        // The tournament row exists past this point: follow-up failures must
        // still navigate to it, or a retried Create inserts a duplicate.
        try {
          await this.persistCategoriesAndPrizes(tournamentId);
        } catch (error: any) {
          toast({
            variant: "destructive",
            title: this.$t("common.error"),
            description: error?.message,
          });
        }
        try {
          await this.persistAttendanceSchedule(tournamentId);
        } catch (error: any) {
          toast({
            variant: "destructive",
            title: "Tournament created, but registration/check-in timing needs attention",
            description:
              error?.message ||
              "Open Settings to review and save the schedule.",
          });
        }
        let awardMappingsFailed = false;
        try {
          await this.persistAwardConfiguration(tournamentId);
        } catch (error: any) {
          awardMappingsFailed = true;
          toast({
            variant: "destructive",
            title: "Tournament created, but award mappings need attention",
            description:
              "Open the Awards tab to review and save the mappings. Some selections may already have been saved.",
          });
        }
        await this.uploadBanner(tournamentId);

        await this.$router.push({
          path: `/tournaments/${tournamentId}`,
          query: awardMappingsFailed ? { tab: "trophies" } : undefined,
        });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: error?.message,
        });
        this.submitting = false;
      }
    },
    // Reuses the exact same helpers TournamentAwardPicker.vue exposes for
    // its own post-creation "Awards Enabled" toggle and "Save award
    // mappings" button -- no separate award-writing logic lives here. Both
    // calls run concurrently and either failing is surfaced to the caller,
    // so create() can flag the tournament for a manual review rather than
    // reporting a misleading full success.
    async persistAwardConfiguration(tournamentId: string) {
      const picker = this.$refs.awardPicker as {
        applyAwardsEnabled?: (
          next: boolean,
          tournamentId: string,
        ) => Promise<void>;
        persistSelections?: (
          tournamentId: string,
          onlyOverrides?: boolean,
        ) => Promise<number>;
      };
      if (!picker) return;

      const tasks: Promise<unknown>[] = [];
      // The tournaments table already defaults new rows to disabled, so
      // there is nothing to write when the organizer left it off.
      if (this.awardsEnabledPending && picker.applyAwardsEnabled) {
        tasks.push(picker.applyAwardsEnabled(true, tournamentId));
      }
      if (picker.persistSelections) {
        // Built-in defaults need no rows: missing slots already resolve to them.
        tasks.push(picker.persistSelections(tournamentId, true));
      }

      const results = await Promise.allSettled(tasks);
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure) throw failure.reason;
    },
    // Same field names, bounds, and update mutation shape as
    // TournamentInformationForm.vue's save() -- attendance_check_in_*_minutes
    // aren't insertable on tournaments (see insert_permissions), so this
    // applies them as a follow-up update, exactly like the edit screen would.
    // A no-op when the organizer left both fields at their defaults, since
    // those already match the columns' own DB defaults.
    async persistAttendanceSchedule(tournamentId: string) {
      const openBefore = Number(this.form.values.attendance_open_before);
      const closeBefore = Number(this.form.values.attendance_close_before);
      if (openBefore === 60 && closeBefore === 15) {
        return;
      }
      await this.$apollo.mutate({
        variables: {
          attendance_open_before: openBefore,
          attendance_close_before: closeBefore,
        },
        mutation: generateMutation({
          update_tournaments_by_pk: [
            {
              pk_columns: { id: tournamentId },
              _set: {
                attendance_check_in_open_before_minutes: $(
                  "attendance_open_before",
                  "Int",
                ),
                attendance_check_in_close_before_minutes: $(
                  "attendance_close_before",
                  "Int",
                ),
              },
            },
            { __typename: true },
          ],
        }),
      });
    },
    async persistCategoriesAndPrizes(tournamentId: string) {
      const categories: string[] = this.form.values.categories ?? [];
      if (categories.length > 0) {
        await this.$apollo.mutate({
          variables: {
            objects: categories.map((category) => ({
              tournament_id: tournamentId,
              category,
            })),
          },
          mutation: generateMutation({
            insert_tournament_categories: [
              {
                objects: $("objects", "[tournament_categories_insert_input!]!"),
              },
              { affected_rows: true },
            ],
          }),
        });
      }

      const prizes = this.prizes
        .filter((prize) => prize.prize.trim())
        .map((prize, index) => ({
          tournament_id: tournamentId,
          place: effectivePlace(prize.place, index),
          prize: normalizePrize(prize.prize),
          order: index,
        }));

      if (prizes.length > 0) {
        await this.$apollo.mutate({
          variables: { objects: prizes },
          mutation: generateMutation({
            insert_tournament_prizes: [
              { objects: $("objects", "[tournament_prizes_insert_input!]!") },
              { affected_rows: true },
            ],
          }),
        });
      }
    },
  },
};
</script>
