import { ref } from "vue";
import { useFocusRow } from "~/composables/useCurrentUserRow";

type SortDir = "asc" | "desc";

export function useTableSort<TKey extends string = string>(
  defaultKey: TKey | null = null,
  defaultDir: SortDir = "desc",
) {
  const focusSteamId = useFocusRow();
  const sortKey = ref<TKey | null>(defaultKey);
  const sortDir = ref<SortDir>(defaultDir);

  function toggle(key: TKey) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
      sortKey.value = key;
      sortDir.value = "desc";
    }
  }

  function sortRows<T>(
    rows: T[],
    getters: Partial<Record<TKey, (row: T) => unknown>>,
  ): T[] {
    const key = sortKey.value;
    const pinFocus = (sorted: T[]) => {
      const sid = focusSteamId?.value;
      if (!sid) return sorted;
      const focused = (row: any) =>
        String(row?.steam_id ?? row?.player?.steam_id ?? "") === sid;
      return [...sorted.filter(focused), ...sorted.filter((row) => !focused(row))];
    };
    if (!key) return pinFocus(rows);
    const getter = getters[key];
    if (!getter) return pinFocus(rows);
    const dir = sortDir.value === "asc" ? 1 : -1;
    return pinFocus(
      [...rows].sort((a, b) => {
        const av = getter(a);
        const bv = getter(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      }),
    );
  }

  return { sortKey, sortDir, toggle, sortRows };
}
