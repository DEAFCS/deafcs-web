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
        id="top-bar"
        :title="$t('pages.settings.application.top_bar.section')"
        :description="$t('pages.settings.application.top_bar.description')"
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
            {{ $t("pages.settings.application.top_bar.hint") }}
          </p>
        </div>
      </SettingsSection>
    </PageTransition>

    <PageTransition :delay="80">
      <SettingsSection
        id="top-bar-logo-link"
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

const ORDER_SETTING_NAME = "public.top_bar_order";
const LOGO_LINK_SETTING_NAME = "public.top_bar_logo_link";

interface TopBarItem {
  key: string;
  label: string;
  order: number;
}

export default {
  data() {
    return {
      logoLinkInput: useApplicationSettingsStore().topBarLogoLink || "",
      // Populated by the `items` watcher below; holds what the admin is
      // currently typing, keyed the same as the persisted order map.
      orderInputs: {} as Record<string, number>,
    };
  },
  computed: {
    plugins(): Plugin[] {
      return usePluginsStore().plugins;
    },
    // Every top-bar slot with its currently effective order (custom
    // override, falling back to the nav's own default), sorted the same way
    // the nav renders them — so the fields load already in nav order.
    items(): TopBarItem[] {
      const order = useApplicationSettingsStore().topBarOrder;
      const pluginCount = this.plugins.length;
      const list: TopBarItem[] = [
        {
          key: "watch",
          label: this.$t("layouts.top_nav.watch_menu") as string,
          order: order.watch ?? 1,
        },
        ...this.plugins.map((plugin, index) => ({
          key: `plugin:${plugin.slug}`,
          label: plugin.title,
          order: order[`plugin:${plugin.slug}`] ?? 2 + index,
        })),
        {
          key: "play",
          label: this.$t("layouts.top_nav.play_menu") as string,
          order: order.play ?? 2 + pluginCount,
        },
        {
          key: "community",
          label: this.$t("layouts.top_nav.community_menu") as string,
          order: order.community ?? 3 + pluginCount,
        },
      ];
      return list.sort((a, b) => a.order - b.order);
    },
    isDirty(): boolean {
      const order = useApplicationSettingsStore().topBarOrder;
      return this.items.some((item) => {
        const saved = order[item.key] ?? item.order;
        return this.orderInputs[item.key] !== saved;
      });
    },
    logoLink(): string | null {
      return useApplicationSettingsStore().topBarLogoLink;
    },
  },
  watch: {
    // Seed the editable numbers once the item list is known, and add any
    // newly-registered plugin without clobbering numbers the admin already
    // typed for the others.
    items: {
      immediate: true,
      handler(list: TopBarItem[]) {
        for (const item of list) {
          if (!(item.key in this.orderInputs)) {
            this.orderInputs[item.key] = item.order;
          }
        }
      },
    },
    logoLink(value: string | null) {
      if (value !== (this.logoLinkInput || null)) {
        this.logoLinkInput = value || "";
      }
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
