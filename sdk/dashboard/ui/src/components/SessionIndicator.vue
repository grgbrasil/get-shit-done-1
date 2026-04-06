<script setup lang="ts">
import { watch } from 'vue';
import { useSessionStore } from '../stores/session';
import { useProjectsStore } from '../stores/projects';

const sessionStore = useSessionStore();
const projectsStore = useProjectsStore();

watch(
  () => projectsStore.activeProjectId,
  (id) => {
    if (id) sessionStore.checkStatus(id);
  },
  { immediate: true },
);

function toggle() {
  const id = projectsStore.activeProjectId;
  if (!id) return;
  if (sessionStore.status.active) {
    sessionStore.stop(id);
  } else {
    sessionStore.start(id);
  }
}
</script>

<template>
  <div class="session-indicator">
    <div class="session-status">
      <span
        class="status-dot"
        :class="sessionStore.status.active ? 'active' : 'inactive'"
      />
      <span class="status-text">
        {{ sessionStore.status.active ? 'Session Active' : 'No Session' }}
      </span>
    </div>
    <button
      v-if="projectsStore.activeProjectId"
      class="session-btn"
      :disabled="sessionStore.loading"
      @click="toggle"
    >
      {{ sessionStore.status.active ? 'Stop' : 'Start' }}
    </button>
  </div>
</template>

<style scoped>
.session-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-top: 1px solid #30363d;
  background: #161b22;
}

.session-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.active {
  background: #3fb950;
  box-shadow: 0 0 6px rgba(63, 185, 80, 0.4);
}

.status-dot.inactive {
  background: #484f58;
}

.status-text {
  font-size: 0.75rem;
  color: #8b949e;
}

.session-btn {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  border: 1px solid #30363d;
  border-radius: 6px;
  background: #21262d;
  color: #c9d1d9;
  cursor: pointer;
  transition: background 0.15s;
}

.session-btn:hover:not(:disabled) {
  background: #30363d;
}

.session-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
