<script setup lang="ts">
defineProps<{ required?: boolean }>();
</script>

<template>
  <Badge
    :variant="required ? 'outline' : 'secondary'"
    class="font-mono text-[10px] tracking-wider uppercase"
    :class="
      required
        ? 'border-[hsl(var(--tac-amber)/0.5)] text-[hsl(var(--tac-amber))]'
        : 'text-muted-foreground'
    "
  >
    {{ required ? $t("common.required") : $t("common.optional") }}
  </Badge>
</template>
