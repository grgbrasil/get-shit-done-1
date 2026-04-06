<script setup lang="ts">
import { onMounted } from 'vue';
import Sidebar from './components/Sidebar.vue';
import Breadcrumb from './components/Breadcrumb.vue';
import { useWebSocket } from './composables/useWebSocket';
import { usePhasesStore } from './stores/phases';
import { useProjectsStore } from './stores/projects';

const { connect, on } = useWebSocket();
const phasesStore = usePhasesStore();
const projectsStore = useProjectsStore();

onMounted(() => {
  connect();
  on('file:changed', () => {
    const id = projectsStore.activeProjectId;
    if (id) phasesStore.loadPhases(id);
  });
  on('file:created', () => {
    const id = projectsStore.activeProjectId;
    if (id) phasesStore.loadPhases(id);
  });
});
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <div class="app-content">
      <Breadcrumb />
      <main class="main-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
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
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}
</style>
