<script setup lang="ts">
import { computed } from "vue";
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
import { Button } from "~/components/ui/button";
import { e_player_roles_enum } from "~/generated/zeus";

useHead({ title: "New Support Request" });

// Server-side enforcement is the real gate (Hasura insert_permissions on
// support_requests is role: verified_user, see
// hasura/metadata/databases/default/tables/public_support_requests.yaml) --
// this only avoids showing an unverified player a form that would be
// rejected on submit, exactly the existing isRoleAbove idiom used
// throughout this app (see middleware/moderator.ts).
const isVerified = computed(() =>
  useAuthStore().isRoleAbove(e_player_roles_enum.verified_user),
);
</script>

<template>
  <PageTransition
    ><TacticalPageHeader
      ><template #title>New Support Request</template></TacticalPageHeader
    ></PageTransition
  >

  <PageTransition v-if="!isVerified" :delay="50" class="mt-6">
    <div
      class="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-lg border border-border bg-card/50 p-6 text-sm"
    >
      <p class="text-foreground">
        {{
          $t(
            "pages.support.new.must_be_verified",
            "You must be verified to submit a support request.",
          )
        }}
      </p>
      <NuxtLink to="/verify">
        <Button variant="tactical" size="sm">{{
          $t("pages.support.new.apply_for_verification", "Apply for verification")
        }}</Button>
      </NuxtLink>
    </div>
  </PageTransition>

  <PageTransition v-else :delay="50" class="mt-6">
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
        <div class="grid gap-5">
          <div class="grid gap-2">
            <Label for="reported-profile">Reported player's DEAFCS profile URL</Label
            ><Input
              id="reported-profile"
              v-model="form.reported_player_profile_url"
              type="url"
              maxlength="500"
              placeholder="https://deafcs.net/players/76561198000000000"
              required
            />
            <p class="text-xs text-muted-foreground">
              Open the player's DEAFCS profile page and paste its URL.
            </p>
          </div>
          <div class="grid gap-2">
            <Label for="related-match">Related match URL or match ID</Label
            ><Input
              id="related-match"
              v-model="form.related_match_reference"
              maxlength="500"
            />
          </div>
          <div class="grid gap-2">
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
        ><Button participation type="submit" variant="tactical" :loading="submitting"
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
  reported_player_profile_url: "",
  related_match_reference: "",
  report_evidence: "",
  organizer_motivation: "",
  organizer_experience: "",
  organizer_languages: "",
  organizer_additional_info: "",
});

// The report form asks for a DEAFCS profile link rather than a raw
// SteamID (much easier to find: copy the page URL instead of looking up a
// number), but the backend column this feeds is still a SteamID64 --
// support_requests_player_report_fields (a DB check constraint) requires
// reported_player_steam_id or reported_player_profile_url to be set, so
// this has to parse the id out client-side rather than sending the link
// alone.
function parseDeafcsProfileSteamId(rawUrl: string): string | null {
  const webDomain = useRuntimeConfig().public.webDomain as
    | string
    | undefined;
  if (!webDomain) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const isOwnDomain =
    url.hostname === webDomain || url.hostname === `www.${webDomain}`;
  if (!isOwnDomain) return null;

  const match = url.pathname.match(/^\/players\/(\d{15,20})\/?$/);
  return match ? match[1] : null;
}

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
      let reportedPlayerSteamId: string | null = null;
      if (this.form.category === "player_report") {
        const profileUrl = this.form.reported_player_profile_url.trim();
        reportedPlayerSteamId = profileUrl
          ? parseDeafcsProfileSteamId(profileUrl)
          : null;
        if (!profileUrl || !reportedPlayerSteamId) {
          toast({
            variant: "destructive",
            title: "Check the profile URL",
            description:
              "Paste the reported player's DEAFCS profile page URL, e.g. https://deafcs.net/players/<id>.",
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
      if (this.form.category === "player_report") {
        // Subject/Message already capture what Reason/Detail used to ask
        // for separately -- the DB still requires report_reason and
        // report_details to be non-empty for a player_report row
        // (support_requests_player_report_fields), so they're derived here
        // instead of asking for them twice in the form.
        object.reported_player_steam_id = reportedPlayerSteamId;
        object.reported_player_profile_url =
          this.form.reported_player_profile_url.trim() || null;
        object.related_match_reference =
          this.form.related_match_reference.trim() || null;
        object.report_reason = subject;
        object.report_details = message;
        object.report_evidence = this.form.report_evidence.trim() || null;
      } else if (this.form.category === "organizer_application") {
        for (const field of [
          "organizer_motivation",
          "organizer_experience",
          "organizer_languages",
          "organizer_additional_info",
        ])
          object[field] = (this.form as any)[field].trim() || null;
      }

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
