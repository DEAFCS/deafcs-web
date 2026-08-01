<template>
  <div class="private-gate-layout">
    <slot />
  </div>
</template>

<style>
.private-gate-layout {
  min-height: 100svh;
  width: 100%;
  overflow-x: hidden;
  background: hsl(240 10% 3.9%);
}
</style>
