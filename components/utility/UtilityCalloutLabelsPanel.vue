<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RotateCcw, Save } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { mapCalloutsQuery } from "~/graphql/mapCalloutsGraphql";
import {
  CLEAR_MAP_CALLOUT_LABEL_MUTATION,
  MAP_CALLOUT_LABELS_QUERY,
  SET_MAP_CALLOUT_LABEL_MUTATION,
} from "~/graphql/mapCalloutLabels";
import { order_by } from "~/generated/zeus";
import { forgetMapCallouts } from "~/composables/useMapCallouts";
import cleanMapName from "~/utilities/cleanMapName";
import { normalizeMapName } from "~/utilities/mapAssets";
import { humanizeCallout } from "~/utilities/mapCallouts";
import { activeDutyNames, splitActiveDuty } from "~/utilities/activeDutyMaps";

// DEAFCS: administrators rename a map's callouts. Only the display name
// changes: the original name stays the key, the boxes are never touched, and
// a 5Stack callouts sync leaves the labels alone. This page is administrator
// only (middleware/application-settings.global.ts) and Hasura only lets the
// administrator role write map_callout_labels.
const MAX_LABEL = 48;

const { t } = useI18n();

const mapsQuery = generateQuery({
  maps: [
    {
      where: {
        enabled: { _eq: true },
        workshop_map_id: { _is_null: true },
      },
      order_by: [{ name: order_by.asc }],
    },
    { name: true, active_pool: true },
  ],
});

const activeMaps = ref<string[]>([]);
const otherMaps = ref<string[]>([]);
const mapName = ref("");

type Row = { name: string; label: string; draft: string; saving: boolean };
const rows = ref<Row[]>([]);
const loading = ref(false);
const failed = ref(false);

onMounted(async () => {
  try {
    const { data } = await getGraphqlClient().query({
      query: mapsQuery,
      fetchPolicy: "network-only",
    });
    const list = ((data as any)?.maps ?? []) as Array<{
      name: string;
      active_pool?: boolean | null;
    }>;
    const names = [...new Set(list.map((map) => normalizeMapName(map.name)))]
      .filter(Boolean)
      .map((name) => ({ name }));
    const split = splitActiveDuty(names, activeDutyNames(list));
    activeMaps.value = split.active.map((map) => map.name);
    otherMaps.value = split.other.map((map) => map.name);
    mapName.value = activeMaps.value[0] ?? otherMaps.value[0] ?? "";
  } catch {
    failed.value = true;
  }
});

async function load(map: string) {
  if (!map) {
    rows.value = [];
    return;
  }

  loading.value = true;
  failed.value = false;

  try {
    const client = getGraphqlClient();
    const [callouts, labels] = await Promise.all([
      client.query({
        query: mapCalloutsQuery,
        variables: { mapName: map },
        fetchPolicy: "network-only",
      }),
      client.query({
        query: MAP_CALLOUT_LABELS_QUERY,
        variables: { mapName: map },
        fetchPolicy: "network-only",
      }),
    ]);

    if (mapName.value !== map) {
      return;
    }

    const named = new Map<string, string>(
      (((labels.data as any)?.map_callout_labels ?? []) as Array<{
        name: string;
        label: string;
      }>).map((row) => [row.name, row.label]),
    );

    rows.value = (((callouts.data as any)?.map_callouts ?? []) as Array<{
      name: string;
    }>)
      .map(({ name }) => ({
        name,
        label: named.get(name) ?? "",
        draft: named.get(name) ?? "",
        saving: false,
      }))
      .sort((a, b) => humanizeCallout(a.name).localeCompare(humanizeCallout(b.name)));
  } catch {
    failed.value = true;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(mapName, load);

const labelled = computed(() => rows.value.filter((row) => row.label).length);

function changed(row: Row) {
  return row.draft.trim() !== row.label;
}

async function save(row: Row) {
  const map = mapName.value;
  const label = row.draft.trim().slice(0, MAX_LABEL);
  if (row.saving || label === row.label) {
    return;
  }

  row.saving = true;
  try {
    // An empty box (or Valve's own wording) means no label at all.
    if (!label || label === humanizeCallout(row.name)) {
      if (row.label) {
        await getGraphqlClient().mutate({
          mutation: CLEAR_MAP_CALLOUT_LABEL_MUTATION,
          variables: { mapName: map, name: row.name },
        });
      }
      row.label = "";
      row.draft = "";
    } else {
      await getGraphqlClient().mutate({
        mutation: SET_MAP_CALLOUT_LABEL_MUTATION,
        variables: { mapName: map, name: row.name, label },
      });
      row.label = label;
      row.draft = label;
    }
    forgetMapCallouts(map);
    toast({ title: t("pages.settings.application.utility.callout_labels.saved") });
  } catch (error: any) {
    toast({
      title: t("pages.settings.application.utility.callout_labels.failed"),
      description: error?.message,
      variant: "destructive",
    });
  } finally {
    row.saving = false;
  }
}

function reset(row: Row) {
  row.draft = "";
  void save(row);
}
</script>

<template>
  <div class="space-y-3" data-testid="callout-labels">
    <p class="text-sm text-muted-foreground">
      {{ $t("pages.settings.application.utility.callout_labels.description") }}
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <Select v-model="mapName">
        <SelectTrigger class="w-56">
          <SelectValue
            :placeholder="$t('pages.settings.application.utility.callout_labels.pick_map')"
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup v-if="activeMaps.length">
            <SelectLabel>{{ $t("pages.utility.picker.active_duty") }}</SelectLabel>
            <SelectItem v-for="map in activeMaps" :key="map" :value="map">
              {{ cleanMapName(map) }}
            </SelectItem>
          </SelectGroup>
          <SelectGroup v-if="otherMaps.length">
            <SelectLabel>{{ $t("pages.utility.picker.other_maps") }}</SelectLabel>
            <SelectItem v-for="map in otherMaps" :key="map" :value="map">
              {{ cleanMapName(map) }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <span
        v-if="rows.length"
        class="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground"
      >
        {{
          $t("pages.settings.application.utility.callout_labels.count", {
            labelled,
            total: rows.length,
          })
        }}
      </span>
    </div>

    <p v-if="failed" class="text-sm text-destructive">
      {{ $t("pages.settings.application.utility.callout_labels.load_failed") }}
    </p>
    <p v-else-if="!loading && mapName && !rows.length" class="text-sm text-muted-foreground">
      {{ $t("pages.settings.application.utility.callout_labels.none") }}
    </p>

    <ul v-if="rows.length" class="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-md border">
      <li
        v-for="row of rows"
        :key="row.name"
        class="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center"
      >
        <div class="min-w-0 sm:w-48">
          <div class="truncate text-sm font-medium">{{ humanizeCallout(row.name) }}</div>
          <div class="truncate font-mono text-[0.65rem] text-muted-foreground">{{ row.name }}</div>
        </div>
        <form class="flex flex-1 items-center gap-2" @submit.prevent="save(row)">
          <Input
            v-model="row.draft"
            :maxlength="MAX_LABEL"
            :placeholder="humanizeCallout(row.name)"
            :aria-label="$t('pages.settings.application.utility.callout_labels.label_for', { name: humanizeCallout(row.name) })"
            class="h-8"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            :disabled="!changed(row)"
            :loading="row.saving"
            :title="$t('pages.settings.application.utility.callout_labels.save')"
          >
            <Save class="h-4 w-4" />
          </Button>
          <Button
            v-if="row.label"
            type="button"
            size="sm"
            variant="ghost"
            :disabled="row.saving"
            :title="$t('pages.settings.application.utility.callout_labels.reset')"
            @click="reset(row)"
          >
            <RotateCcw class="h-4 w-4" />
          </Button>
        </form>
      </li>
    </ul>
  </div>
</template>
