import { ref } from "vue";

const KEY = "deafcs:left-nav-folded";

function read(): Record<string, true> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

// What the visitor has shut, in this browser. Only shut sections are recorded,
// so a section added later starts open.
const folded = ref<Record<string, true>>(
  typeof window === "undefined" ? {} : read(),
);

export function useLeftNavFold() {
  const isOpen = (section: string) => !folded.value[section];

  function setOpen(section: string, open: boolean) {
    if (isOpen(section) === open) {
      return;
    }
    const next = { ...folded.value };
    if (open) {
      delete next[section];
    } else {
      next[section] = true;
    }
    folded.value = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private windows keep the choice for this visit only.
    }
  }

  return { isOpen, setOpen };
}
