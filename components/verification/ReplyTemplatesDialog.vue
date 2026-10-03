<script setup lang="ts">
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Spinner } from "~/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-3xl">
      <DialogTitle>{{
        $t("pages.verification_applications.templates.title", "Saved replies")
      }}</DialogTitle>
      <DialogDescription class="sr-only">
        {{
          $t(
            "pages.verification_applications.templates.description",
            "Pick a saved reply to insert into the message box.",
          )
        }}
      </DialogDescription>

      <div v-if="loading" class="flex justify-center py-10">
        <Spinner class="h-6 w-6" />
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <ul class="flex flex-col gap-1 rounded-lg border border-border/60 p-2" role="listbox">
          <li v-for="item in items" :key="item.slot">
            <button
              type="button"
              role="option"
              :aria-selected="item.slot === selectedSlot"
              class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              :class="{
                'bg-muted font-medium': item.slot === selectedSlot,
                'text-muted-foreground': !item.body,
              }"
              @click="select(item.slot)"
            >
              <span class="w-4 shrink-0 text-xs tabular-nums">{{ item.slot }}.</span>
              <span class="min-w-0 flex-1 truncate">
                {{
                  item.body
                    ? item.title || item.body
                    : $t("pages.verification_applications.templates.empty", "Empty slot")
                }}
              </span>
            </button>
          </li>
        </ul>

        <div class="flex min-h-[14rem] flex-col gap-3">
          <template v-if="editing">
            <Input
              v-model="draftTitle"
              maxlength="60"
              :placeholder="
                $t('pages.verification_applications.templates.title_placeholder', 'Short title')
              "
            />
            <Textarea
              v-model="draftBody"
              maxlength="4000"
              rows="9"
              :placeholder="
                $t('pages.verification_applications.templates.body_placeholder', 'Message text')
              "
            />
            <div class="flex justify-end gap-2">
              <Button variant="outline" :disabled="saving" @click="editing = false">
                {{ $t("common.cancel") }}
              </Button>
              <Button variant="tactical" :loading="saving" :disabled="saving" @click="save">
                {{ $t("common.save") }}
              </Button>
            </div>
          </template>

          <template v-else>
            <div v-if="selected?.body" class="flex-1">
              <p v-if="selected.title" class="mb-1 text-sm font-medium">{{ selected.title }}</p>
              <p class="whitespace-pre-wrap text-sm text-foreground/90">{{ selected.body }}</p>
            </div>
            <p v-else class="flex-1 text-sm text-muted-foreground">
              {{
                $t(
                  "pages.verification_applications.templates.empty_hint",
                  "This slot is empty. Press Edit to write a reply.",
                )
              }}
            </p>

            <div class="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" @click="startEdit">
                {{ $t("pages.verification_applications.templates.edit", "Edit") }}
              </Button>
              <div class="flex gap-2">
                <Button variant="outline" @click="$emit('update:open', false)">
                  {{ $t("common.cancel") }}
                </Button>
                <Button variant="tactical" :disabled="!selected?.body" @click="insert">
                  {{ $t("pages.verification_applications.templates.insert", "Insert") }}
                </Button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts">
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";

const REPLY_TEMPLATE_SLOTS = 5;

// Raw GraphQL text, not the Zeus builder: the table postdates the generated
// client.
const TEMPLATES_QUERY = gql`
  query AdminReplyTemplates {
    admin_reply_templates(order_by: { slot: asc }) {
      slot
      title
      body
    }
  }
`;

const SAVE_TEMPLATE = gql`
  mutation SaveAdminReplyTemplate($slot: smallint!, $title: String!, $body: String!) {
    insert_admin_reply_templates_one(
      object: { slot: $slot, title: $title, body: $body }
      on_conflict: { constraint: admin_reply_templates_pkey, update_columns: [title, body] }
    ) {
      slot
    }
  }
`;

const DELETE_TEMPLATE = gql`
  mutation DeleteAdminReplyTemplate($owner: bigint!, $slot: smallint!) {
    delete_admin_reply_templates_by_pk(owner_steam_id: $owner, slot: $slot) {
      slot
    }
  }
`;

type Template = { slot: number; title: string; body: string };

export default {
  props: {
    open: { type: Boolean, default: false },
  },
  emits: ["update:open", "insert"],
  data() {
    return {
      loading: false,
      saving: false,
      editing: false,
      selectedSlot: 1,
      draftTitle: "",
      draftBody: "",
      saved: [] as Template[],
    };
  },
  watch: {
    open: {
      immediate: true,
      handler(open: boolean) {
        if (!open) return;
        this.editing = false;
        this.selectedSlot = 1;
        void this.load();
      },
    },
  },
  computed: {
    // Always five slots; unsaved ones are empty.
    items(): Template[] {
      return Array.from({ length: REPLY_TEMPLATE_SLOTS }, (_, i) => {
        const slot = i + 1;
        return (
          this.saved.find((template) => template.slot === slot) ?? {
            slot,
            title: "",
            body: "",
          }
        );
      });
    },
    selected(): Template | undefined {
      return this.items.find((item) => item.slot === this.selectedSlot);
    },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          query: TEMPLATES_QUERY,
          fetchPolicy: "network-only",
        });
        this.saved = data?.admin_reply_templates ?? [];
      } catch (error) {
        this.fail(error);
      } finally {
        this.loading = false;
      }
    },
    select(slot: number) {
      this.selectedSlot = slot;
      this.editing = false;
    },
    startEdit() {
      this.draftTitle = this.selected?.title ?? "";
      this.draftBody = this.selected?.body ?? "";
      this.editing = true;
    },
    // An empty text clears the slot.
    async save() {
      if (this.saving) return;
      const slot = this.selectedSlot;
      const body = this.draftBody.trim();
      const title = this.draftTitle.trim();
      this.saving = true;
      try {
        if (!body) {
          await (this.$apollo as any).mutate({
            mutation: DELETE_TEMPLATE,
            variables: { owner: useAuthStore().me?.steam_id, slot },
          });
          this.saved = this.saved.filter((template) => template.slot !== slot);
        } else {
          await (this.$apollo as any).mutate({
            mutation: SAVE_TEMPLATE,
            variables: { slot, title, body },
          });
          this.saved = [
            ...this.saved.filter((template) => template.slot !== slot),
            { slot, title, body },
          ];
        }
        this.editing = false;
      } catch (error) {
        this.fail(error);
      } finally {
        this.saving = false;
      }
    },
    insert() {
      if (!this.selected?.body) return;
      this.$emit("insert", this.selected.body);
      this.$emit("update:open", false);
    },
    fail(error: unknown) {
      toast({
        variant: "destructive",
        title: this.$t("common.error"),
        description: (error as Error).message,
      });
    },
  },
};
</script>
