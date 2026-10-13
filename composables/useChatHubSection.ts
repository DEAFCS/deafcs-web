import { ref } from "vue";

const section = ref<"all" | "rooms" | "people">("all");

export function useChatHubSection() {
  return {
    section,
    setSection: (value: typeof section.value) => {
      section.value = value;
    },
  };
}
