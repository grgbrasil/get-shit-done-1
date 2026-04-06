<script setup lang="ts">
</script>

<template>
  <div class="app-shell">
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style>
.app-shell {
  display: flex;
  height: 100vh;
  background: #0f1117;
  color: #e1e4e8;
}
.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
