<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

type AwardOption = {
  id: string;
  name: string;
  description?: string | null;
  tier?: string | null;
  archived_at?: string | null;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    awards: AwardOption[];
    selectedId?: string | null;
  }>(),
  { selectedId: null },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [award: AwardOption];
}>();

const query = ref("");
const availableAwards = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return props.awards.filter(
    (award) =>
      !award.archived_at &&
      (!needle ||
        award.name.toLocaleLowerCase().includes(needle) ||
        award.description?.toLocaleLowerCase().includes(needle)),
  );
});

function selectAward(award: AwardOption) {
  emit("select", award);
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ $t("awards.composer.choose") }}</DialogTitle>
      </DialogHeader>
      <Input
        v-model="query"
        :placeholder="$t('awards.composer.choose')"
        autocomplete="off"
      />
      <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
        <Button
          v-for="award in availableAwards"
          :key="award.id"
          type="button"
          variant="ghost"
          class="h-auto w-full justify-start border px-3 py-2 text-left"
          :class="{ 'border-primary': award.id === selectedId }"
          @click="selectAward(award)"
        >
          <span>
            <span class="block font-semibold">{{ award.name }}</span>
            <span
              v-if="award.description"
              class="block text-xs text-muted-foreground"
            >
              {{ award.description }}
            </span>
          </span>
        </Button>
        <p
          v-if="availableAwards.length === 0"
          class="py-6 text-center text-sm text-muted-foreground"
        >
          {{ $t("awards.no_awards") }}
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
