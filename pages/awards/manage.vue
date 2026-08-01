<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, reactive, ref } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Pencil,
  Plus,
  Search,
} from "lucide-vue-next";
import { toast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import ImageUploadTile from "~/components/ImageUploadTile.vue";
import AwardArtwork from "~/components/award/AwardArtwork.vue";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import Empty from "~/components/ui/empty/Empty.vue";
import EmptyTitle from "~/components/ui/empty/EmptyTitle.vue";
import EmptyDescription from "~/components/ui/empty/EmptyDescription.vue";
import { Skeleton } from "~/components/ui/skeleton";
import {
  AWARD_TIERS,
  awardScope,
  type AwardCatalogAward,
} from "~/utilities/awardCatalog";
import {
  awardDefinitionDraft,
  awardIdentityLocked,
  awardImageIntent,
  awardSaveVariables,
  emptyAwardDefinitionDraft,
  validateAwardDefinition,
  type AwardDefinitionDraft,
  type AwardManagementScope,
  type AwardValidationErrors,
  type ManagedAwardDefinition,
} from "~/utilities/awardManagement";
import { resolveAwardImageUrl } from "~/utilities/awardArtwork";
import {
  tacticalCtaButtonClasses,
  tacticalHeaderActionClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

definePageMeta({
  middleware: "award-management",
});

useHead({ title: "Manage Awards" });

const MANAGED_AWARDS_QUERY = gql`
  query ManagedAwardDefinitions {
    awards(order_by: [{ archived_at: asc_nulls_first }, { name: asc }]) {
      id
      name
      description
      tier
      silhouette
      image_url
      system_key
      allow_multiple
      archived_at
      tournament_id
      event_id
      elo_season_id
      league_season_id
      tournament { id name }
      event { id name }
      elo_season { id number }
      league_season { id name season_number }
      occurrences_aggregate { aggregate { count } }
    }
    tournaments(order_by: { name: asc }) { id name }
    events(order_by: { name: asc }) { id name }
    seasons(order_by: { number: desc }) { id number }
    league_seasons(order_by: { season_number: desc }) {
      id
      name
      season_number
    }
  }
`;

const SAVE_AWARD_MUTATION = gql`
  mutation SaveAwardDefinition(
    $id: uuid
    $name: String!
    $description: String
    $tier: String!
    $silhouette: Int
    $allow_multiple: Boolean
    $tournament_id: uuid
    $event_id: uuid
    $elo_season_id: uuid
    $league_season_id: uuid
  ) {
    saveAward(
      id: $id
      name: $name
      description: $description
      tier: $tier
      silhouette: $silhouette
      allow_multiple: $allow_multiple
      tournament_id: $tournament_id
      event_id: $event_id
      elo_season_id: $elo_season_id
      league_season_id: $league_season_id
    ) {
      id
      name
      image_url
    }
  }
`;

const ARCHIVE_AWARD_MUTATION = gql`
  mutation ArchiveAwardDefinition($id: uuid!, $archived: Boolean!) {
    archiveAward(id: $id, archived: $archived) { id name }
  }
`;

interface ManagedAward extends AwardCatalogAward, ManagedAwardDefinition {
  tournament?: { id: string; name: string } | null;
  event?: { id: string; name: string } | null;
  elo_season?: { id: string; number: number } | null;
  league_season?: {
    id: string;
    name?: string | null;
    season_number: number;
  } | null;
}

interface ScopeOwner {
  id: string;
  name?: string | null;
  number?: number | null;
  season_number?: number | null;
}

interface ManagementQueryResult {
  awards: ManagedAward[];
  tournaments: ScopeOwner[];
  events: ScopeOwner[];
  seasons: ScopeOwner[];
  league_seasons: ScopeOwner[];
}

const { resolveClient } = useApolloClient();
const definitions = ref<ManagedAward[]>([]);
const tournaments = ref<ScopeOwner[]>([]);
const events = ref<ScopeOwner[]>([]);
const seasons = ref<ScopeOwner[]>([]);
const leagueSeasons = ref<ScopeOwner[]>([]);
const loading = ref(true);
const loadError = ref<Error | null>(null);
const search = ref("");
const status = ref<"all" | "active" | "archived">("all");

const formOpen = ref(false);
const editingAward = ref<ManagedAward | null>(null);
const draft = reactive<AwardDefinitionDraft>(emptyAwardDefinitionDraft());
const formErrors = ref<AwardValidationErrors>({});
const formError = ref("");
const saving = ref(false);
const pendingImage = ref<Blob | null>(null);
const removeImage = ref(false);
const imageEditorKey = ref(0);

const archiveTarget = ref<ManagedAward | null>(null);
const archiving = ref(false);

const scopeLabels: Record<AwardManagementScope, string> = {
  global: "Global / shared",
  tournament: "Tournament",
  event: "Event",
  elo_season: "ELO season",
  league_season: "League season",
};

const filteredDefinitions = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  return definitions.value.filter((award) => {
    if (status.value === "active" && award.archived_at) return false;
    if (status.value === "archived" && !award.archived_at) return false;
    if (!needle) return true;
    return `${award.name} ${award.description || ""} ${award.system_key || ""}`
      .toLocaleLowerCase()
      .includes(needle);
  });
});

const identityLocked = computed(() => awardIdentityLocked(editingAward.value));
const currentImageSrc = computed(() => {
  if (removeImage.value) return null;
  return resolveAwardImageUrl(
    editingAward.value?.image_url,
    useRuntimeConfig().public.apiDomain as string,
  );
});

const scopeOwners = computed(() => {
  if (draft.scope === "tournament") {
    return tournaments.value.map(({ id, name }) => ({ id, label: name || id }));
  }
  if (draft.scope === "event") {
    return events.value.map(({ id, name }) => ({ id, label: name || id }));
  }
  if (draft.scope === "elo_season") {
    return seasons.value.map(({ id, number }) => ({
      id,
      label: number == null ? id : `ELO Season ${number}`,
    }));
  }
  if (draft.scope === "league_season") {
    return leagueSeasons.value.map(({ id, name, season_number }) => ({
      id,
      label: name || (season_number == null ? id : `League Season ${season_number}`),
    }));
  }
  return [];
});

function definitionScopeLabel(award: ManagedAward) {
  const scope = awardScope(award);
  return `${scopeLabels[scope.kind]}${scope.ownerName ? ` / ${scope.ownerName}` : ""}`;
}

function onScopeChange() {
  draft.scopeId = "";
  formErrors.value = { ...formErrors.value, scope: undefined };
}

function openCreate() {
  editingAward.value = null;
  Object.assign(draft, emptyAwardDefinitionDraft());
  resetImageDraft();
  formErrors.value = {};
  formError.value = "";
  formOpen.value = true;
}

function openEdit(award: ManagedAward) {
  editingAward.value = award;
  Object.assign(draft, awardDefinitionDraft(award));
  resetImageDraft();
  formErrors.value = {};
  formError.value = "";
  formOpen.value = true;
}

function resetImageDraft() {
  pendingImage.value = null;
  removeImage.value = false;
  imageEditorKey.value++;
}

function onImageSelected(blob: Blob) {
  pendingImage.value = blob;
  removeImage.value = false;
}

function onImageRemoved() {
  pendingImage.value = null;
  removeImage.value = !!editingAward.value?.image_url;
}

async function loadDefinitions() {
  loading.value = true;
  loadError.value = null;
  try {
    const result = await resolveClient().query<ManagementQueryResult>({
      query: MANAGED_AWARDS_QUERY,
      fetchPolicy: "network-only",
    });
    definitions.value = result.data.awards || [];
    tournaments.value = result.data.tournaments || [];
    events.value = result.data.events || [];
    seasons.value = result.data.seasons || [];
    leagueSeasons.value = result.data.league_seasons || [];
  } catch (caught) {
    loadError.value =
      caught instanceof Error ? caught : new Error(String(caught));
  } finally {
    loading.value = false;
  }
}

async function uploadAwardImage(awardId: string, image: Blob) {
  const formData = new FormData();
  formData.append("file", image, "award.webp");
  const response = await fetch(
    `https://${useRuntimeConfig().public.apiDomain}/avatars/awards/${awardId}`,
    { method: "POST", credentials: "include", body: formData },
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Image upload failed (${response.status})`,
    );
  }
}

async function removeAwardArtwork(awardId: string) {
  const response = await fetch(
    `https://${useRuntimeConfig().public.apiDomain}/avatars/awards/${awardId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `Image removal failed (${response.status})`,
    );
  }
}

async function saveDefinition() {
  const errors = validateAwardDefinition(draft);
  formErrors.value = errors;
  formError.value = "";
  if (Object.keys(errors).length > 0) return;

  saving.value = true;
  try {
    const result = await resolveClient().mutate<{
      saveAward: { id: string; name: string; image_url?: string | null } | null;
    }>({
      mutation: SAVE_AWARD_MUTATION,
      variables: awardSaveVariables(draft, editingAward.value),
    });
    const saved = result.data?.saveAward;
    if (!saved?.id) throw new Error("The award could not be saved.");

    const imageIntent = awardImageIntent(
      pendingImage.value,
      removeImage.value,
    );
    if (imageIntent === "upload" && pendingImage.value) {
      await uploadAwardImage(saved.id, pendingImage.value);
    } else if (imageIntent === "remove") {
      await removeAwardArtwork(saved.id);
    }

    toast({
      title: editingAward.value ? "Award updated" : "Award created",
      description: saved.name,
    });
    formOpen.value = false;
    await loadDefinitions();
  } catch (caught: any) {
    formError.value = caught?.message || "Could not save the award.";
    toast({
      title: "Could not save award",
      description: formError.value,
      variant: "destructive",
    });
  } finally {
    saving.value = false;
  }
}

function requestArchive(award: ManagedAward) {
  if (award.system_key) return;
  archiveTarget.value = award;
}

async function confirmArchive() {
  const target = archiveTarget.value;
  if (!target || target.system_key) return;

  const archived = !target.archived_at;
  archiving.value = true;
  try {
    await resolveClient().mutate({
      mutation: ARCHIVE_AWARD_MUTATION,
      variables: { id: target.id, archived },
    });
    toast({ title: archived ? "Award archived" : "Award restored" });
    archiveTarget.value = null;
    await loadDefinitions();
  } catch (caught: any) {
    toast({
      title: archived ? "Could not archive award" : "Could not restore award",
      description: caught?.message,
      variant: "destructive",
    });
  } finally {
    archiving.value = false;
  }
}

onMounted(loadDefinitions);
</script>

<template>
  <PageTransition :delay="0">
    <main class="space-y-5 py-6">
      <NuxtLink
        to="/awards"
        class="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        Back to Awards
      </NuxtLink>

      <TacticalPageHeader inline-actions>
        <template #title>Manage Awards</template>
        <template #subtitle>
          Create and maintain reusable award definitions. Recipients and
          tournament mappings are managed separately.
        </template>
        <template #actions>
          <Button
            type="button"
            :class="[
              tacticalCtaButtonClasses,
              tacticalHeaderActionClasses,
              'max-sm:aspect-square max-sm:!px-0',
            ]"
            title="Create award"
            @click="openCreate"
          >
            <Plus class="h-4 w-4" aria-hidden="true" />
            <span class="max-sm:sr-only">Create award</span>
          </Button>
        </template>
      </TacticalPageHeader>

      <section class="space-y-4" aria-labelledby="award-definitions-heading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="award-definitions-heading"
            :class="[tacticalSectionLabelClasses, 'mb-0']"
          >
            <span :class="tacticalSectionTickClasses"></span>
            Award definitions
            <span class="font-mono text-[0.62rem] text-muted-foreground">
              {{ filteredDefinitions.length }}/{{ definitions.length }}
            </span>
          </h2>

          <div class="flex w-full flex-wrap gap-2 sm:w-auto">
            <label class="relative min-w-52 flex-1 sm:flex-none">
              <span class="sr-only">Search award definitions</span>
              <Search
                class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                v-model="search"
                type="search"
                class="pl-8 sm:w-64"
                placeholder="Search definitions"
              />
            </label>
            <label>
              <span class="sr-only">Filter by archive status</span>
              <select
                v-model="status"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
        </div>

        <div
          v-if="loading"
          class="space-y-2"
          aria-busy="true"
          aria-label="Loading award definitions"
        >
          <Skeleton v-for="index in 6" :key="index" class="h-20 w-full" />
        </div>

        <Empty
          v-else-if="loadError"
          class="min-h-52 border border-dashed border-destructive/50"
          role="alert"
        >
          <EmptyTitle>Could not load award definitions</EmptyTitle>
          <EmptyDescription>{{ loadError.message }}</EmptyDescription>
          <Button variant="outline" @click="loadDefinitions">Try again</Button>
        </Empty>

        <Empty
          v-else-if="!filteredDefinitions.length"
          class="min-h-52 border border-dashed border-border"
        >
          <EmptyTitle>No matching definitions</EmptyTitle>
          <EmptyDescription>
            Create an award or change the current filters.
          </EmptyDescription>
        </Empty>

        <div
          v-else
          class="overflow-x-auto rounded-lg border border-border bg-card/30"
        >
          <table class="w-full min-w-[74rem] text-left text-sm">
            <thead class="border-b border-border bg-muted/30">
              <tr class="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
                <th scope="col" class="px-3 py-2">Image</th>
                <th scope="col" class="px-3 py-2">Definition</th>
                <th scope="col" class="px-3 py-2">Tier</th>
                <th scope="col" class="px-3 py-2">Scope</th>
                <th scope="col" class="px-3 py-2">Repeatable</th>
                <th scope="col" class="px-3 py-2">Type</th>
                <th scope="col" class="px-3 py-2">Status</th>
                <th scope="col" class="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/60">
              <tr
                v-for="award in filteredDefinitions"
                :key="award.id"
                class="transition-colors hover:bg-muted/20 motion-reduce:transition-none"
                :class="award.archived_at && 'opacity-65'"
              >
                <td class="px-3 py-3">
                  <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border bg-background/60">
                    <AwardArtwork :award="award" size="xs" />
                  </div>
                </td>
                <td class="max-w-xs px-3 py-3">
                  <p class="font-semibold text-foreground">{{ award.name }}</p>
                  <p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {{ award.description || "No description provided." }}
                  </p>
                </td>
                <td class="px-3 py-3 font-mono text-xs uppercase">{{ award.tier }}</td>
                <td class="px-3 py-3 text-xs text-muted-foreground">{{ definitionScopeLabel(award) }}</td>
                <td class="px-3 py-3">{{ award.allow_multiple ? "Yes" : "No" }}</td>
                <td class="px-3 py-3">
                  <span class="rounded-sm border border-border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.12em]">
                    {{ award.system_key ? "Built-in" : "Custom" }}
                  </span>
                </td>
                <td class="px-3 py-3">
                  <span
                    class="rounded-sm border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.12em]"
                    :class="
                      award.archived_at
                        ? 'border-muted-foreground/35 text-muted-foreground'
                        : 'border-success/40 text-success'
                    "
                  >
                    {{ award.archived_at ? "Archived" : "Active" }}
                  </span>
                </td>
                <td class="px-3 py-3">
                  <div class="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      :aria-label="`Edit ${award.name}`"
                      @click="openEdit(award)"
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      :disabled="!!award.system_key"
                      :title="award.system_key ? 'Built-in awards cannot be archived' : undefined"
                      :aria-label="`${award.archived_at ? 'Unarchive' : 'Archive'} ${award.name}`"
                      @click="requestArchive(award)"
                    >
                      <ArchiveRestore v-if="award.archived_at" aria-hidden="true" />
                      <Archive v-else aria-hidden="true" />
                      {{ award.archived_at ? "Unarchive" : "Archive" }}
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </PageTransition>

  <Dialog v-model:open="formOpen">
    <DialogContent class="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {{ editingAward ? "Edit award definition" : "Create award definition" }}
        </DialogTitle>
        <DialogDescription>
          This creates one reusable definition. It does not grant the award or
          attach it to a tournament placement.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-5" novalidate @submit.prevent="saveDefinition">
        <div
          v-if="formError"
          class="rounded-md border border-destructive/45 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {{ formError }}
        </div>

        <div
          v-if="identityLocked"
          class="rounded-md border border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.08)] px-3 py-2 text-xs text-muted-foreground"
        >
          Tier, scope, and repeatable status are locked because this is a
          built-in or historically used definition. Name, description, and
          artwork can still be updated.
        </div>

        <div class="grid gap-5 sm:grid-cols-[1fr_11rem]">
          <div class="space-y-4">
            <div class="space-y-1.5">
              <label for="award-name" class="text-sm font-medium">Name</label>
              <Input
                id="award-name"
                v-model="draft.name"
                maxlength="120"
                autocomplete="off"
                :aria-invalid="!!formErrors.name"
                :aria-describedby="formErrors.name ? 'award-name-error' : undefined"
              />
              <p v-if="formErrors.name" id="award-name-error" class="text-xs text-destructive" role="alert">
                {{ formErrors.name }}
              </p>
            </div>

            <div class="space-y-1.5">
              <label for="award-description" class="text-sm font-medium">Description</label>
              <Textarea
                id="award-description"
                v-model="draft.description"
                :rows="4"
                maxlength="500"
                placeholder="Describe what this award recognizes."
              />
            </div>
          </div>

          <ImageUploadTile
            :key="imageEditorKey"
            mode="deferred"
            aspect="square"
            fit="contain"
            label="Custom image"
            hint="Upload award artwork"
            :image-alt="`${draft.name || 'Award'} artwork preview`"
            :current-src="currentImageSrc"
            :has-custom="!!currentImageSrc"
            :disabled="saving"
            :crop-output="{ w: 512, h: 512 }"
            allow-fit-whole
            @apply="onImageSelected"
            @removed="onImageRemoved"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label for="award-tier" class="text-sm font-medium">Tier</label>
            <select
              id="award-tier"
              v-model="draft.tier"
              :disabled="identityLocked"
              :aria-invalid="!!formErrors.tier"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option v-for="tierOption in AWARD_TIERS" :key="tierOption" :value="tierOption">
                {{ tierOption === "mvp" ? "MVP" : tierOption.charAt(0).toUpperCase() + tierOption.slice(1) }}
              </option>
            </select>
            <p v-if="formErrors.tier" class="text-xs text-destructive" role="alert">{{ formErrors.tier }}</p>
          </div>

          <div class="space-y-1.5">
            <label for="award-scope" class="text-sm font-medium">Scope</label>
            <select
              id="award-scope"
              v-model="draft.scope"
              required
              :disabled="identityLocked"
              :aria-invalid="!!formErrors.scope"
              :aria-describedby="formErrors.scope ? 'award-scope-error' : undefined"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              @change="onScopeChange"
            >
              <option v-for="(label, value) in scopeLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <p v-if="formErrors.scope" id="award-scope-error" class="text-xs text-destructive" role="alert">
              {{ formErrors.scope }}
            </p>
          </div>

          <div v-if="draft.scope !== 'global'" class="space-y-1.5 sm:col-span-2">
            <label for="award-scope-owner" class="text-sm font-medium">Scope owner <span class="text-muted-foreground">(optional)</span></label>
            <select
              id="award-scope-owner"
              v-model="draft.scopeId"
              :disabled="identityLocked"
              aria-describedby="award-scope-owner-help"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Global reusable award</option>
              <option v-for="owner in scopeOwners" :key="owner.id" :value="owner.id">
                {{ owner.label }}
              </option>
            </select>
            <p id="award-scope-owner-help" class="text-xs text-muted-foreground">
              This definition can be reused across multiple tournaments or seasons.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 p-3">
          <div>
            <label for="award-repeatable" class="text-sm font-medium">Repeatable award</label>
            <p class="text-xs text-muted-foreground">
              Allow the same recipient to earn this definition more than once
              within the same scope.
            </p>
          </div>
          <Switch
            id="award-repeatable"
            v-model="draft.repeatable"
            :disabled="identityLocked"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="saving" @click="formOpen = false">
            Cancel
          </Button>
          <Button type="submit" :loading="saving">
            {{ editingAward ? "Save changes" : "Create definition" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog
    :open="!!archiveTarget"
    @update:open="(open) => !open && !archiving && (archiveTarget = null)"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ archiveTarget?.archived_at ? "Unarchive award?" : "Archive award?" }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          <template v-if="archiveTarget?.archived_at">
            {{ archiveTarget?.name }} will become available in active award lists again.
          </template>
          <template v-else>
            {{ archiveTarget?.name }} will leave active selection lists. Historical
            occurrences and recipients will be preserved.
          </template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="archiving">Cancel</AlertDialogCancel>
        <Button
          :variant="archiveTarget?.archived_at ? 'default' : 'destructive'"
          :loading="archiving"
          @click="confirmArchive"
        >
          {{ archiveTarget?.archived_at ? "Unarchive" : "Archive" }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
