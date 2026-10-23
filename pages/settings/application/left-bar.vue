<script setup lang="ts">
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import SettingsPage from "~/components/settings/SettingsPage.vue";
import SettingsSection from "~/components/settings/SettingsSection.vue";

definePageMeta({
  middleware: "admin",
});
</script>

<template>
  <SettingsPage>
    <PageTransition :delay="0">
      <SettingsSection
        id="left-bar"
        :title="$t('pages.settings.application.left_bar.section')"
        :description="$t('pages.settings.application.left_bar.description')"
      >
        <div class="max-w-md space-y-2">
          <div
            v-for="item in items"
            :key="item.key"
            class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
          >
            <span class="truncate text-sm font-medium">{{ item.label }}</span>
            <Input
              type="number"
              class="w-20 text-center"
              :model-value="orderInputs[item.key]"
              @update:model-value="
                (value) => (orderInputs[item.key] = Number(value) || 0)
              "
            />
          </div>

          <Button
            variant="tactical"
            size="sm"
            class="mt-2"
            :disabled="!isDirty"
            @click="save"
          >
            {{ $t("common.save") }}
          </Button>

          <p class="text-xs text-muted-foreground">
            {{ $t("pages.settings.application.left_bar.hint") }}
          </p>
        </div>
      </SettingsSection>
    </PageTransition>

    <PageTransition :delay="80">
      <SettingsSection
        id="left-bar-logo-link"
        :title="$t('pages.settings.application.top_bar.logo_link.title')"
        :description="
          $t('pages.settings.application.top_bar.logo_link.description')
        "
      >
        <div class="flex max-w-lg gap-2">
          <Input
            v-model="logoLinkInput"
            :placeholder="
              $t('pages.settings.application.top_bar.logo_link.placeholder')
            "
            @keydown.enter.prevent="saveLogoLink"
          />
          <Button
            variant="outline"
            :disabled="logoLinkInput === (logoLink || '')"
            @click="saveLogoLink"
          >
            {{ $t("common.save") }}
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ $t("pages.settings.application.top_bar.logo_link.hint") }}
        </p>
      </SettingsSection>
    </PageTransition>
  </SettingsPage>
</template>

<script lang="ts">
import { settings_constraint, settings_update_column } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";
import type { Plugin } from "~/stores/Plugins";
import { leftBarOrder } from "~/utilities/leftBarOrder";

const ORDER_SETTING_NAME = "public.left_bar_order";
// Where the brand logo at the top of the left nav goes. Kept under its old
// name so the value an administrator already set carries over.
const LOGO_LINK_SETTING_NAME = "public.top_bar_logo_link";

interface LeftBarItem {
  key: string;
  label: string;
  order: number;
}

export default {
  data() {
    return {
      // What the admin is currently typing, keyed like the persisted order map.
      orderInputs: {} as Record<string, number>,
      logoLinkInput: useApplicationSettingsStore().topBarLogoLink || "",
    };
  },
  computed: {
    plugins(): Plugin[] {
      return usePluginsStore().visiblePlugins;
    },
    // Every block with its effective order (override, else the nav's default),
    // sorted the way the nav draws them. Inventory only when the app is there.
    items(): LeftBarItem[] {
      const saved = useApplicationSettingsStore().leftBarOrder;
      const keys = ["play", "watch"];
      if (this.plugins.some((plugin) => plugin.slug === "inventory")) {
        keys.push("inventory");
      }
      keys.push(
        "compete",
        "practice",
        "media",
        "roster",
        "social",
        "apps",
        "information",
      );
      const labels: Record<string, string> = {
        play: this.$t("layouts.app_nav.navigation.play") as string,
        watch: this.$t("layouts.app_nav.navigation.watch") as string,
        inventory: "Inventory",
        compete: this.$t("layouts.app_nav.sections.compete") as string,
        practice: this.$t("layouts.app_nav.sections.practice") as string,
        media: this.$t("layouts.app_nav.sections.media") as string,
        roster: this.$t("layouts.app_nav.sections.roster") as string,
        social: this.$t("layouts.app_nav.sections.social") as string,
        apps: this.$t("layouts.app_nav.sections.apps") as string,
        information: this.$t("layouts.app_nav.sections.information") as string,
      };
      return keys
        .map((key) => ({
          key,
          label: labels[key],
          order: leftBarOrder(saved, key),
        }))
        .sort((a, b) => a.order - b.order);
    },
    logoLink(): string | null {
      return useApplicationSettingsStore().topBarLogoLink;
    },
    isDirty(): boolean {
      const saved = useApplicationSettingsStore().leftBarOrder;
      return this.items.some(
        (item) => this.orderInputs[item.key] !== leftBarOrder(saved, item.key),
      );
    },
  },
  watch: {
    logoLink(value: string | null) {
      if (value !== (this.logoLinkInput || null)) {
        this.logoLinkInput = value || "";
      }
    },
    // Seed the editable numbers once the list is known, without clobbering
    // numbers the admin already typed for the others.
    items: {
      immediate: true,
      handler(list: LeftBarItem[]) {
        for (const item of list) {
          if (!(item.key in this.orderInputs)) {
            this.orderInputs[item.key] = item.order;
          }
        }
      },
    },
  },
  methods: {
    async save() {
      const object: Record<string, number> = {};
      for (const item of this.items) {
        object[item.key] = Number(this.orderInputs[item.key]) || 0;
      }

      await this.persistSetting(ORDER_SETTING_NAME, JSON.stringify(object));
      toast({
        title: this.$t("pages.settings.application.update_success") as string,
      });
    },
    async saveLogoLink() {
      await this.persistSetting(
        LOGO_LINK_SETTING_NAME,
        this.logoLinkInput.trim(),
      );
      toast({
        title: this.$t("pages.settings.application.update_success") as string,
      });
    },
    async persistSetting(name: string, value: string) {
      await (this as any).$apollo.mutate({
        mutation: generateMutation({
          insert_settings: [
            {
              objects: [{ name, value }],
              on_conflict: {
                constraint: settings_constraint.settings_pkey,
                update_columns: [settings_update_column.value],
              },
            },
            { __typename: true },
          ],
        }),
      });
    },
  },
};
</script>
