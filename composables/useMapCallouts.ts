import { computed, onMounted, ref, unref, watch } from "vue";
import type { Ref } from "vue";
import { useI18n } from "vue-i18n";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { mapCalloutsQuery } from "~/graphql/mapCalloutsGraphql";
import { MAP_CALLOUT_LABELS_QUERY } from "~/graphql/mapCalloutLabels";
import { normalizeMapName } from "~/utilities/mapAssets";
import {
  autoUtilityName,
  calloutAt as resolveCalloutAt,
} from "~/utilities/mapCallouts";
import type { CalloutPoint, MapCallout } from "~/utilities/mapCallouts";
import type { UtilityType } from "~/types/utility";

// Module scope: a map's callouts are the same forty rows for every board,
// panel and card on the page, and they only change when Valve patches the map.
const cache = new Map<string, Promise<MapCallout[]>>();

// DEAFCS: the labels come from their own query, so an api without the table
// (or a failed request) only loses the labels, never the callouts.
function loadCalloutLabels(map: string): Promise<Map<string, string>> {
  return getGraphqlClient()
    .query({
      query: MAP_CALLOUT_LABELS_QUERY,
      variables: { mapName: map },
      fetchPolicy: "network-only",
    })
    .then(({ data }) => {
      const labels = new Map<string, string>();
      for (const row of ((data as any)?.map_callout_labels ?? []) as Array<{
        name: string;
        label: string;
      }>) {
        if (row?.name && row?.label?.trim()) {
          labels.set(row.name, row.label.trim());
        }
      }
      return labels;
    })
    .catch(() => new Map<string, string>());
}

/** After an administrator changes a label, so the next board reads it fresh. */
export function forgetMapCallouts(mapName: string) {
  cache.delete(normalizeMapName(mapName));
}

export function loadMapCallouts(mapName: string): Promise<MapCallout[]> {
  const map = normalizeMapName(mapName);
  if (!map) {
    return Promise.resolve([]);
  }

  const hit = cache.get(map);
  if (hit) {
    return hit;
  }

  const labels = loadCalloutLabels(map);
  const request = getGraphqlClient()
    .query({
      query: mapCalloutsQuery,
      variables: { mapName: map },
      fetchPolicy: "cache-first",
    })
    .then(async ({ data }) => {
      const named = await labels;
      return ((data?.map_callouts ?? []) as Array<{ name: string; boxes: unknown }>)
        .map((row) => ({
          name: row.name,
          boxes: Array.isArray(row.boxes) ? (row.boxes as MapCallout["boxes"]) : [],
          label: named.get(row.name) ?? null,
        }))
        .filter(({ boxes }) => boxes.length > 0);
    })
    // A map nobody has extracted is not an error -- it has no callouts, and
    // every caller already copes with that. Not memoised, so a genuine network
    // failure is retried by the next board that mounts.
    .catch(() => {
      cache.delete(map);
      return [] as MapCallout[];
    });

  cache.set(map, request);
  return request;
}

export function useMapCallouts(
  mapName: Ref<string | null | undefined> | (() => string | null | undefined),
) {
  const { t } = useI18n();

  const callouts = ref<MapCallout[]>([]);
  const normalizedMap = computed(() =>
    normalizeMapName(unref(typeof mapName === "function" ? mapName() : mapName) ?? ""),
  );

  async function load() {
    const map = normalizedMap.value;
    if (!map) {
      callouts.value = [];
      return;
    }
    const loaded = await loadMapCallouts(map);
    if (normalizedMap.value === map) {
      callouts.value = loaded;
    }
  }

  onMounted(load);
  watch(normalizedMap, load);

  function calloutAt(point: CalloutPoint | null | undefined) {
    return resolveCalloutAt(point, callouts.value);
  }

  function autoName(
    utilityType: UtilityType,
    origin: CalloutPoint | null | undefined,
    landing: CalloutPoint | null | undefined,
  ) {
    return autoUtilityName({
      utilityType,
      origin,
      landing,
      callouts: callouts.value,
      t,
    });
  }

  return {
    callouts,
    hasCallouts: computed(() => callouts.value.length > 0),
    calloutAt,
    autoName,
    load,
  };
}
