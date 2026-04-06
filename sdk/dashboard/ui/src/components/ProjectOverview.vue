<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, type Overview } from '../api';

const route = useRoute();
const overview = ref<Overview | null>(null);
const loading = ref(false);

async function load() {
  const projectId = route.params.projectId as string;
  if (!projectId) return;
  loading.value = true;
  try {
    overview.value = await api.overview(projectId);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => route.params.projectId, load);

function completedPhases(): number {
  return overview.value?.roadmap?.phases.filter((p) => p.roadmap_complete).length ?? 0;
}

function totalPhases(): number {
  return overview.value?.roadmap?.phases.length ?? 0;
}

function progressPercent(): number {
  const total = totalPhases();
  if (total === 0) return 0;
  return Math.round((completedPhases() / total) * 100);
}
</script>

<template>
  <div class="overview" v-if="overview">
    <h1>Project Overview</h1>
    <div class="metrics">
      <div class="metric-card">
        <div class="metric-value">{{ completedPhases() }} / {{ totalPhases() }}</div>
        <div class="metric-label">Phases Complete</div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent() + '%' }"></div>
        </div>
      </div>
    </div>
    <div v-if="overview.roadmap" class="phase-list">
      <h2>Phases</h2>
      <div v-for="phase in overview.roadmap.phases" :key="phase.number" class="phase-row">
        <span class="status-dot" :class="phase.roadmap_complete ? 'complete' : 'pending'"></span>
        <span class="phase-number">{{ phase.number }}</span>
        <span class="phase-name">{{ phase.phase_name }}</span>
        <span class="phase-status">{{ phase.roadmap_complete ? 'Complete' : phase.disk_status }}</span>
      </div>
    </div>
  </div>
  <div v-else-if="loading" class="loading">Loading...</div>
  <div v-else class="empty">Select a project to view its overview.</div>
</template>

<style scoped>
.overview { max-width: 800px; }
h1 { font-size: 1.5rem; margin-bottom: 1.5rem; }
h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: #8b949e; }
.metrics { display: flex; gap: 1rem; margin-bottom: 2rem; }
.metric-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 1.25rem;
  min-width: 200px;
}
.metric-value { font-size: 1.8rem; font-weight: 600; color: #58a6ff; }
.metric-label { font-size: 0.85rem; color: #8b949e; margin-top: 0.25rem; }
.progress-bar {
  height: 6px; background: #30363d; border-radius: 3px; margin-top: 0.75rem; overflow: hidden;
}
.progress-fill {
  height: 100%; background: #238636; border-radius: 3px; transition: width 0.3s ease;
}
.phase-list { margin-top: 1rem; }
.phase-row {
  display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0;
  border-bottom: 1px solid #21262d; font-size: 0.9rem;
}
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-dot.complete { background: #238636; }
.status-dot.pending { background: #484f58; }
.phase-number { color: #58a6ff; font-weight: 500; min-width: 30px; }
.phase-name { flex: 1; }
.phase-status { color: #8b949e; font-size: 0.8rem; }
.loading, .empty { color: #8b949e; padding: 2rem; }
</style>
