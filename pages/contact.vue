<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  Bug,
  Building2,
  Handshake,
  LifeBuoy,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  ShieldAlert,
  Trophy,
  UserCog,
} from "lucide-vue-next";
import InfoPage from "~/components/info/InfoPage.vue";
import ContactCard from "~/components/info/ContactCard.vue";
import InlineToken from "~/components/info/InlineToken.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const { t } = useI18n();
const authStore = useAuthStore();

useHead({ title: () => t("pages.info.contact.title") });

const internalCategories = [
  {
    category: "general_support",
    title: "General Support",
    description:
      "Questions about DEAFCS features, matches, or your experience.",
    icon: MessageCircle,
  },
  {
    category: "bug_report",
    title: "Bug Report",
    description:
      "Tell us what broke, what you expected, and how to reproduce it.",
    icon: Bug,
  },
  {
    category: "player_report",
    title: "Report a Player",
    description:
      "Send a private conduct report. Only you and DEAFCS administrators can read it.",
    icon: ShieldAlert,
  },
  {
    category: "feedback",
    title: "Feedback / Suggestion",
    description: "Share an idea or tell us how DEAFCS could work better.",
    icon: Lightbulb,
  },
  {
    category: "organizer_application",
    title: "Tournament Organizer Application",
    description:
      "Apply to help organize tournaments. An administrator reviews every application.",
    icon: Trophy,
  },
] as const;

const publicCategories = [
  {
    title: "Account / Login Help",
    description:
      "Use this if Steam sign-in is not working or you cannot access your DEAFCS account. This option works without signing in to DEAFCS.",
    subject: "Account / Login Help",
    icon: LockKeyhole,
  },
  {
    title: "Business / Media",
    description:
      "For business enquiries, interviews, press, and media requests.",
    subject: "Business / Media",
    icon: Building2,
  },
] as const;

function internalTarget(category: string) {
  const target = `/support/new?category=${category}`;
  return authStore.me?.steam_id
    ? target
    : `/login?redirect=${encodeURIComponent(target)}`;
}

function emailTarget(subject: string) {
  return `mailto:info@deafcs.net?subject=${encodeURIComponent(`[DEAFCS] ${subject}`)}`;
}
</script>

<template>
  <InfoPage
    :title="$t('pages.info.contact.title')"
    :intro="$t('pages.info.contact.intro')"
  />

  <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
    <div class="flex flex-col gap-3">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.contact.live_match.title") }}
      </span>
      <ContactCard
        :icon="LifeBuoy"
        :title="$t('pages.info.contact.live_match.title')"
        :description="$t('pages.info.contact.live_match.description')"
        highlight
      >
        <ol
          class="flex list-decimal flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/90"
        >
          <li>{{ $t("pages.info.contact.live_match.step_1") }}</li>
          <i18n-t
            keypath="pages.info.contact.live_match.step_2"
            tag="li"
            scope="global"
          >
            <template #menu>
              <InlineToken>⋮ menu</InlineToken>
            </template>
          </i18n-t>
          <li>{{ $t("pages.info.contact.live_match.step_3") }}</li>
        </ol>
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ $t("pages.info.contact.live_match.note") }}
        </p>
      </ContactCard>
    </div>

    <div class="flex flex-col gap-5">
      <span :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" />
        {{ $t("pages.info.contact.other_ways") }}
      </span>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-bold uppercase tracking-[0.08em]">
          Internal DEAFCS Requests
        </h2>
        <div
          class="rounded-lg border border-border/60 bg-card/20 p-4 text-sm leading-relaxed text-foreground/90"
        >
          These requests stay inside DEAFCS. You must sign in to submit one,
          and only you and suitable administrators can read the conversation.
          <NuxtLink
            v-if="authStore.me?.steam_id"
            to="/support"
            class="ml-1 font-semibold text-[hsl(var(--tac-amber))] hover:underline"
            >View your requests.</NuxtLink
          >
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ContactCard
            v-for="category in internalCategories"
            :key="category.category"
            :icon="category.icon"
            :title="category.title"
            :description="category.description"
            :to="internalTarget(category.category)"
            :action="
              authStore.me?.steam_id ? 'Create request' : 'Sign in to submit'
            "
          />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-bold uppercase tracking-[0.08em]">
          Public / Email Contact
        </h2>
        <div
          class="rounded-lg border border-border/60 bg-card/20 p-4 text-sm leading-relaxed text-foreground/90"
        >
          Email is available for account or login problems and external or
          business enquiries. No DEAFCS login is required. Send your name,
          reply email, subject, and enough detail for us to help. For account
          help, include your Steam profile or SteamID if known.
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ContactCard
            v-for="category in publicCategories"
            :key="category.subject"
            :icon="category.icon"
            :title="category.title"
            :description="category.description"
            :href="emailTarget(category.subject)"
            action="Email info@deafcs.net"
          />

          <ContactCard
            :icon="UserCog"
            :title="$t('pages.info.contact.account_data.title')"
          >
            <i18n-t
              keypath="pages.info.contact.account_data.description"
              tag="p"
              scope="global"
              class="text-sm leading-relaxed text-foreground/90"
            >
              <template #link>
                <NuxtLink
                  to="/account-data"
                  class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
                >
                  {{ $t("pages.info.account_data.title") }}
                </NuxtLink>
              </template>
            </i18n-t>
          </ContactCard>

          <ContactCard
            :icon="ShieldCheck"
            :title="$t('pages.info.contact.privacy.title')"
            :href="emailTarget('Privacy / Legal')"
            action="Email info@deafcs.net"
          >
            <i18n-t
              keypath="pages.info.contact.privacy.description"
              tag="p"
              scope="global"
              class="text-sm leading-relaxed text-foreground/90"
            >
              <template #link>
                <NuxtLink
                  to="/privacy-policy"
                  class="font-semibold text-[hsl(var(--tac-amber))] hover:underline"
                >
                  {{ $t("pages.info.privacy_policy.title") }}
                </NuxtLink>
              </template>
            </i18n-t>
          </ContactCard>

          <ContactCard
            :icon="Handshake"
            :title="$t('pages.info.contact.partnerships.title')"
            :description="$t('pages.info.contact.partnerships.description')"
            :href="emailTarget('Partnerships & Server Support')"
            action="Email info@deafcs.net"
          />
        </div>
      </section>
    </div>
  </div>
</template>
