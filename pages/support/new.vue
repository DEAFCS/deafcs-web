<script setup lang="ts">
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

useHead({ title: "New Support Request" });
</script>

<template>
  <PageTransition
    ><TacticalPageHeader
      ><template #title>New Support Request</template></TacticalPageHeader
    ></PageTransition
  >
  <PageTransition :delay="50" class="mt-6">
    <form
      class="mx-auto flex max-w-3xl flex-col gap-6"
      @submit.prevent="submitRequest"
    >
      <Card class="p-6">
        <div class="grid gap-5">
          <div class="grid gap-2">
            <Label for="category">Category</Label>
            <Select v-model="form.category"
              ><SelectTrigger id="category"
                ><SelectValue placeholder="Choose a category" /></SelectTrigger
              ><SelectContent
                ><SelectItem
                  v-for="category in categories"
                  :key="category.value"
                  :value="category.value"
                  >{{ category.label }}</SelectItem
                ></SelectContent
              ></Select
            >
          </div>
          <div class="grid gap-2">
            <Label for="subject">Subject</Label
            ><Input
              id="subject"
              v-model="form.subject"
              maxlength="160"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="message">Message</Label
            ><Textarea
              id="message"
              v-model="form.initial_message"
              rows="6"
              maxlength="5000"
              required
            />
            <p class="text-xs text-muted-foreground">
              Include the details an administrator needs to understand the
              request.
            </p>
          </div>
        </div>
      </Card>

      <Card v-if="form.category === 'player_report'" class="p-6">
        <h2 class="mb-1 font-semibold">Private player report</h2>
        <p class="mb-5 text-sm text-muted-foreground">
          This report is visible only to you and DEAFCS administrators.
        </p>
        <div class="grid gap-5 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="reported-steam-id">Reported player SteamID</Label
            ><Input
              id="reported-steam-id"
              v-model="form.reported_player_steam_id"
              inputmode="numeric"
              placeholder="Optional if profile URL is supplied"
            />
          </div>
          <div class="grid gap-2">
            <Label for="reported-profile">Steam profile URL</Label
            ><Input
              id="reported-profile"
              v-model="form.reported_player_profile_url"
              type="url"
              maxlength="500"
              placeholder="Optional if SteamID is supplied"
            />
          </div>
          <div class="grid gap-2 sm:col-span-2">
            <Label for="related-match">Related match URL or match ID</Label
            ><Input
              id="related-match"
              v-model="form.related_match_reference"
              maxlength="500"
            />
          </div>
          <div class="grid gap-2 sm:col-span-2">
            <Label for="report-reason">Reason</Label
            ><Input
              id="report-reason"
              v-model="form.report_reason"
              maxlength="160"
              required
            />
          </div>
          <div class="grid gap-2 sm:col-span-2">
            <Label for="report-details">Details</Label
            ><Textarea
              id="report-details"
              v-model="form.report_details"
              rows="5"
              maxlength="5000"
              required
            />
          </div>
          <div class="grid gap-2 sm:col-span-2">
            <Label for="report-evidence">Evidence</Label
            ><Textarea
              id="report-evidence"
              v-model="form.report_evidence"
              rows="3"
              maxlength="5000"
              placeholder="Optional links, timestamps, or other evidence"
            />
          </div>
        </div>
      </Card>

      <Card v-if="form.category === 'organizer_application'" class="p-6">
        <h2 class="mb-1 font-semibold">Tournament organizer application</h2>
        <p class="mb-5 text-sm text-muted-foreground">
          Submitting does not grant the organizer role. An administrator will
          review your application and reply here.
        </p>
        <div class="grid gap-5">
          <div class="grid gap-2">
            <Label for="motivation"
              >Why do you want to organize tournaments?</Label
            ><Textarea
              id="motivation"
              v-model="form.organizer_motivation"
              rows="4"
              maxlength="5000"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="experience"
              >Previous event or tournament experience</Label
            ><Textarea
              id="experience"
              v-model="form.organizer_experience"
              rows="3"
              maxlength="5000"
              placeholder="Optional"
            />
          </div>
          <div class="grid gap-2">
            <Label for="languages">Languages</Label
            ><Input
              id="languages"
              v-model="form.organizer_languages"
              maxlength="500"
              placeholder="Optional"
            />
          </div>
          <div class="grid gap-2">
            <Label for="organizer-info">Additional information</Label
            ><Textarea
              id="organizer-info"
              v-model="form.organizer_additional_info"
              rows="3"
              maxlength="5000"
              placeholder="Optional"
            />
          </div>
        </div>
      </Card>

      <div class="flex justify-end gap-2">
        <Button as-child variant="outline"
          ><NuxtLink to="/support">Cancel</NuxtLink></Button
        ><Button type="submit" variant="tactical" :loading="submitting"
          >Submit Request</Button
        >
      </div>
    </form>
  </PageTransition>
</template>

<script lang="ts">
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";

const categories = [
  { value: "general_support", label: "General Support" },
  { value: "bug_report", label: "Bug Report" },
  { value: "player_report", label: "Report a Player" },
  { value: "feedback", label: "Feedback / Suggestion" },
  { value: "organizer_application", label: "Tournament Organizer Application" },
];
const categoryValues = new Set(categories.map(({ value }) => value));
const INSERT_REQUEST = gql`
  mutation InsertSupportRequest($object: support_requests_insert_input!) {
    insert_support_requests_one(object: $object) {
      id
    }
  }
`;
const emptyForm = () => ({
  category: "general_support",
  subject: "",
  initial_message: "",
  reported_player_steam_id: "",
  reported_player_profile_url: "",
  related_match_reference: "",
  report_reason: "",
  report_details: "",
  report_evidence: "",
  organizer_motivation: "",
  organizer_experience: "",
  organizer_languages: "",
  organizer_additional_info: "",
});

export default {
  data: () => ({ categories, form: emptyForm(), submitting: false }),
  mounted() {
    const category = Array.isArray(this.$route.query.category)
      ? this.$route.query.category[0]
      : this.$route.query.category;
    if (typeof category === "string" && categoryValues.has(category))
      this.form.category = category;
  },
  methods: {
    async submitRequest() {
      if (this.submitting) return;
      const subject = this.form.subject.trim();
      const message = this.form.initial_message.trim();
      if (subject.length < 3 || message.length < 10) {
        toast({
          variant: "destructive",
          title: "More detail needed",
          description:
            "Use at least 3 characters for the subject and 10 for the message.",
        });
        return;
      }
      if (this.form.category === "player_report") {
        const steamId = this.form.reported_player_steam_id.trim();
        if (
          (!steamId && !this.form.reported_player_profile_url.trim()) ||
          !this.form.report_reason.trim() ||
          !this.form.report_details.trim()
        ) {
          toast({
            variant: "destructive",
            title: "Complete the player report",
            description: "Add the player, a reason, and report details.",
          });
          return;
        }
        if (steamId && !/^\d{15,20}$/.test(steamId)) {
          toast({
            variant: "destructive",
            title: "Check the SteamID",
            description:
              "Use a numeric SteamID or leave it blank and provide a Steam profile URL.",
          });
          return;
        }
      }
      if (
        this.form.category === "organizer_application" &&
        !this.form.organizer_motivation.trim()
      ) {
        toast({ variant: "destructive", title: "Motivation is required" });
        return;
      }

      const object: Record<string, unknown> = {
        category: this.form.category,
        subject,
        initial_message: message,
      };
      const fields =
        this.form.category === "player_report"
          ? [
              "reported_player_steam_id",
              "reported_player_profile_url",
              "related_match_reference",
              "report_reason",
              "report_details",
              "report_evidence",
            ]
          : this.form.category === "organizer_application"
            ? [
                "organizer_motivation",
                "organizer_experience",
                "organizer_languages",
                "organizer_additional_info",
              ]
            : [];
      for (const field of fields)
        object[field] = (this.form as any)[field].trim() || null;

      this.submitting = true;
      try {
        const { data } = await (this.$apollo as any).mutate({
          mutation: INSERT_REQUEST,
          variables: { object },
        });
        toast({ title: "Support request submitted" });
        await this.$router.push(
          `/support/${data.insert_support_requests_one.id}`,
        );
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Could not submit request",
          description: (error as Error).message,
        });
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>
