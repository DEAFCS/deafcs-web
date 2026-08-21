<script setup lang="ts">
import { FormControl, FormField, FormItem } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import ImageUploadTile from "~/components/ImageUploadTile.vue";
import AddressSearch from "~/components/AddressSearch.vue";
import CategorySelect from "~/components/tournament/CategorySelect.vue";
import DateTimePicker from "~/components/tournament/DateTimePicker.vue";
import { ExternalLink } from "lucide-vue-next";
import SettingsSaveBar from "~/components/settings/SettingsSaveBar.vue";

import {
  tacticalSectionLabelClasses as sectionLabelClasses,
  tacticalSectionTickClasses as sectionTickClasses,
} from "~/utilities/tacticalClasses";
</script>

<template>
  <form @submit.prevent="save" class="mx-auto grid max-w-3xl gap-8">
    <!-- Branding -->
    <section class="grid gap-4">
      <div :class="[sectionLabelClasses, 'mb-0']">
        <span :class="sectionTickClasses"></span>
        {{ $t("tournament.form.section.branding") }}
      </div>
      <div class="grid gap-4 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-start">
        <div class="grid gap-1.5">
          <Label>{{ $t("tournament.form.logo.label") }}</Label>
          <ImageUploadTile
            aspect="square"
            fit="contain"
            :upload-url="`https://${apiDomain}/avatars/tournaments/${tournament.id}`"
            :delete-url="`https://${apiDomain}/avatars/tournaments/${tournament.id}`"
            :has-custom="!!tournament.logo"
            :current-src="tournamentLogoSrc"
          />
        </div>
        <div class="grid gap-1.5">
          <Label>{{ $t("tournament.banner.label") }}</Label>
          <ImageUploadTile
            aspect="banner"
            fit="contain"
            allow-fit-whole
            filename="banner.webp"
            :hint="$t('tournament.banner.hint')"
            :upload-url="`https://${apiDomain}/avatars/tournaments/${tournament.id}/banner`"
            :delete-url="`https://${apiDomain}/avatars/tournaments/${tournament.id}/banner`"
            :has-custom="!!tournament.banner"
            :current-src="tournamentBannerSrc"
          />
        </div>
      </div>
    </section>

    <!-- Details -->
    <section class="grid gap-4">
      <div :class="[sectionLabelClasses, 'mb-0']">
        <span :class="sectionTickClasses"></span>
        {{ $t("tournament.form.section.details") }}
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
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.description") }}</FormLabel>
          <FormControl>
            <Textarea v-bind="componentField" rows="3" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
    </section>

    <!-- Schedule -->
    <section class="grid gap-4">
      <div :class="[sectionLabelClasses, 'mb-0']">
        <span :class="sectionTickClasses"></span>
        {{ $t("tournament.form.section.schedule") }}
      </div>

      <FormField v-slot="{ value }" name="start">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.start") }}</FormLabel>
          <FormControl>
            <DateTimePicker
              :model-value="value"
              :disabled="scheduleFrozen"
              @update:model-value="(date) => form.setFieldValue('start', date)"
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
              <Input
                type="number"
                min="15"
                max="240"
                :disabled="scheduleFrozen"
                v-bind="componentField"
              />
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
              <Input
                type="number"
                min="5"
                max="60"
                :disabled="scheduleFrozen"
                v-bind="componentField"
              />
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

      <!-- One notice for the whole schedule group rather than repeating it on
           each of the four locked values. -->
      <p
        v-if="scheduleFrozen"
        class="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      >
        {{ $t("tournament.form.attendance.locked") }}
      </p>
    </section>

    <!-- Classification & Venue -->
    <section class="grid gap-4">
      <div :class="[sectionLabelClasses, 'mb-0']">
        <span :class="sectionTickClasses"></span>
        {{ $t("tournament.form.section.classification") }}
      </div>

      <FormField v-slot="{ value }" name="categories">
        <FormItem>
          <FormLabel>{{ $t("tournament.form.categories.label") }}</FormLabel>
          <CategorySelect
            :model-value="value"
            @update:model-value="
              (categories) => form.setFieldValue('categories', categories)
            "
          />
          <FormMessage />
        </FormItem>
      </FormField>

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
          <FormMessage />
        </FormItem>
      </FormField>
    </section>

    <div class="pb-24"></div>

    <SettingsSaveBar
      :dirty="isDirty"
      :submitting="submitting"
      @save="save"
      @discard="discardChanges"
    />
  </form>
</template>

<script lang="ts">
import * as z from "zod";
import { useForm } from "vee-validate";
import { generateMutation } from "~/graphql/graphqlGen";
import { $ } from "~/generated/zeus";
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { toast } from "@/components/ui/toast";
import {
  formatAttendanceWindowRange,
  isAttendanceScheduleFrozen,
} from "~/utilities/tournamentAttendance";

export default {
  props: {
    tournament: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      submitting: false,
      baseline: null as string | null,
      isDirty: false,
      form: useForm({
        keepValuesOnUnmount: true,
        validationSchema: toTypedSchema(
          z.object({
            name: z.string().min(1),
            start: z.date(),
            description: z.string().nullable().default(null),
            homepage: z.string().nullable().default(null),
            location: z.string().nullable().default(null),
            latitude: z.number().nullable().default(null),
            longitude: z.number().nullable().default(null),
            categories: z.string().array().default([]),
            // Mirrors the backend CHECK constraints on tournaments
            // (tournaments_attendance_*): 15-240 / 5-60, open > close, and
            // at least a 5-minute window between them.
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
          }).refine(
            (values) =>
              values.attendance_open_before - values.attendance_close_before >= 5,
            {
              message: this.$t("tournament.form.attendance.invalid_window"),
              path: ["attendance_open_before"],
            },
          ),
        ),
      }),
    };
  },
  watch: {
    tournament: {
      immediate: true,
      handler() {
        if (this.baseline === null || !this.isDirty) {
          this.populate();
        }
      },
    },
    ["form.values"]: {
      deep: true,
      handler() {
        this.isDirty =
          this.baseline !== null &&
          JSON.stringify(this.form.values) !== this.baseline;
      },
    },
  },
  computed: {
    apiDomain() {
      return useRuntimeConfig().public.apiDomain;
    },
    tournamentLogoSrc() {
      if (!this.tournament?.logo) {
        return null;
      }
      return `https://${this.apiDomain}/${this.tournament.logo}`;
    },
    tournamentBannerSrc() {
      if (!this.tournament?.banner) {
        return null;
      }
      return `https://${this.apiDomain}/${this.tournament.banner}`;
    },
    // Live preview of the resulting window, driven by the form's own current
    // Once tournament attendance check-in has opened, the four values that
    // define that window -- the start (one datetime control) and the two
    // offsets -- are frozen. The scheduler and every participant are already
    // acting on the window, so moving it retroactively is what produced the
    // confusing state during live testing.
    //
    // Deliberately reads the PERSISTED tournament, never this.form.values:
    // otherwise an organizer could push the start into the future and unfreeze
    // themselves. The backend enforces the identical rule against OLD values.
    //
    // Not keyed off individual_registration_enabled -- this is about tournament
    // attendance, which normal team tournaments use too.
    scheduleFrozen() {
      return isAttendanceScheduleFrozen(this.tournament as any);
    },
    // Uses live form values (not the saved tournament), so it updates as the
    // organizer types. Suppressed while the values are out of range, rather
    // than rendering a nonsensical range next to a validation error.
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
    populate() {
      this.form.setValues({
        name: this.tournament.name,
        start: new Date(this.tournament.start),
        description: this.tournament.description,
        homepage: this.tournament.homepage ?? null,
        location: this.tournament.location ?? null,
        // Hasura's float8 scalar arrives as a string; coerce so the numeric
        // schema (and the mutation's float8 vars) get real numbers.
        latitude:
          this.tournament.latitude != null
            ? Number(this.tournament.latitude)
            : null,
        longitude:
          this.tournament.longitude != null
            ? Number(this.tournament.longitude)
            : null,
        categories: (this.tournament.categories ?? []).map(
          (category: any) => category.category,
        ),
        attendance_open_before:
          this.tournament.attendance_check_in_open_before_minutes ?? 60,
        attendance_close_before:
          this.tournament.attendance_check_in_close_before_minutes ?? 15,
      });
      this.$nextTick(() => {
        this.baseline = JSON.stringify(this.form.values);
        this.isDirty = false;
      });
    },
    discardChanges() {
      this.populate();
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
    async syncCategories() {
      const existing: string[] = (this.tournament.categories ?? []).map(
        (category: any) => category.category,
      );
      const selected: string[] = this.form.values.categories ?? [];
      const toDelete = existing.filter(
        (category) => !selected.includes(category),
      );
      const toInsert = selected.filter(
        (category) => !existing.includes(category),
      );

      if (toDelete.length > 0) {
        await this.$apollo.mutate({
          variables: { tournamentId: this.tournament.id, categories: toDelete },
          mutation: generateMutation({
            delete_tournament_categories: [
              {
                where: {
                  tournament_id: { _eq: $("tournamentId", "uuid!") },
                  category: { _in: $("categories", "[String!]!") },
                },
              },
              { affected_rows: true },
            ],
          }),
        });
      }

      if (toInsert.length > 0) {
        await this.$apollo.mutate({
          variables: {
            objects: toInsert.map((category) => ({
              tournament_id: this.tournament.id,
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
    },
    async save() {
      if (this.submitting) {
        return;
      }

      const { valid, errors } = await this.form.validate();
      if (!valid) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: Object.values(errors ?? {})[0] as string,
        });
        return;
      }

      this.submitting = true;
      try {
        await this.$apollo.mutate({
          variables: {
            name: this.form.values.name,
            start: this.form.values.start,
            description: this.form.values.description,
            homepage: this.form.values.homepage || null,
            location: this.form.values.location || null,
            latitude: this.form.values.latitude ?? null,
            longitude: this.form.values.longitude ?? null,
            attendance_open_before: Number(
              this.form.values.attendance_open_before,
            ),
            attendance_close_before: Number(
              this.form.values.attendance_close_before,
            ),
          },
          mutation: generateMutation({
            update_tournaments_by_pk: [
              {
                pk_columns: { id: this.tournament.id },
                _set: {
                  name: $("name", "String!"),
                  start: $("start", "timestamptz!"),
                  description: $("description", "String"),
                  homepage: $("homepage", "String"),
                  location: $("location", "String"),
                  latitude: $("latitude", "float8"),
                  longitude: $("longitude", "float8"),
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

        await this.syncCategories();

        toast({ title: this.$t("tournament.updated") as string });

        this.$nextTick(() => {
          this.baseline = JSON.stringify(this.form.values);
          this.isDirty = false;
        });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: error?.message,
        });
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>
