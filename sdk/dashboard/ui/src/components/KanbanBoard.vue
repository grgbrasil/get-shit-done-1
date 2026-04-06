<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePhasesStore } from '../stores/phases';
import { useFileConflicts } from '../composables/useFileConflicts';
import KanbanCard from './KanbanCard.vue';
import type { PlanInfo } from '../api';

const route = useRoute();
const router = useRouter();
const phasesStore = usePhasesStore();

const projectId = computed(() => route.params.projectId as string);
const phaseId = computed(() => route.params.phaseId as string);
const phaseDetail = computed(() => phasesStore.phaseDetails[phaseId.value]);
const allPlans = computed<PlanInfo[]>(() => phaseDetail.value?.plans ?? []);
const { getConflictForPlan } = useFileConflicts(allPlans);

const waves = computed(() => {
  if (!phaseDetail.value) return [];
  const waveMap = phaseDetail.value.waves;
  return Object.keys(waveMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((waveNum) => ({
      number: Number(waveNum),
      planIds: waveMap[waveNum],
      plans: waveMap[waveNum]
        .map((id) => allPlans.value.find((p) => p.id === id))
        .filter(Boolean) as PlanInfo[],
    }));
});

const completedCount = computed(() => allPlans.value.filter((p) => p.has_summary).length);
const totalCount = computed(() => allPlans.value.length);

function isWaveBlocked(waveNum: number): boolean {
  if (waveNum <= 1) return false;
  const prevWave = waves.value.find((w) => w.number === waveNum - 1);
  if (!prevWave) return false;
  return prevWave.plans.some((p) => !p.has_summary);
}

function navigateToPlan(planId: string) {
  router.push(`/project/${projectId.value}/phase/${phaseId.value}/plan/${planId}`);
}

onMounted(() => {
  if (projectId.value && phaseId.value) {
    phasesStore.loadPhaseDetail(projectId.value, phaseId.value);
  }
});

watch([projectId, phaseId], () => {
  if (projectId.value && phaseId.value) {
    phasesStore.loadPhaseDetail(projectId.value, phaseId.value);
  }
});
</script>

<template>
  <div class="kanban">
    <div class="kanban-header">
      <h1>Phase {{ phaseId }}</h1>
      <span class="progress">{{ completedCount }} / {{ totalCount }} plans complete</span>
    </div>
    <div class="kanban-columns">
      <div v-for="wave in waves" :key="wave.number" class="wave-column">
        <div class="wave-header">
          <h3>Wave {{ wave.number }}</h3>
          <span class="wave-count">{{ wave.plans.length }} plans</span>
        </div>
        <div class="wave-cards">
          <KanbanCard
            v-for="plan in wave.plans"
            :key="plan.id"
            :plan="plan"
            :conflict-color="getConflictForPlan(plan.id)?.color ?? null"
            :conflict-files="getConflictForPlan(plan.id)?.files ?? []"
            :is-blocked="isWaveBlocked(wave.number)"
            :is-running="false"
            @click="navigateToPlan"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban { height: 100%; display: flex; flex-direction: column; }
.kanban-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.kanban-header h1 { font-size: 1.3rem; }
.progress { font-size: 0.85rem; color: #8b949e; }
.kanban-columns { flex: 1; display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem; }
.wave-column {
  min-width: 280px; max-width: 320px; flex-shrink: 0;
  background: #0d1117; border: 1px solid #21262d; border-radius: 8px; padding: 0.75rem;
}
.wave-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #21262d;
}
.wave-header h3 { font-size: 0.9rem; color: #58a6ff; }
.wave-count { font-size: 0.75rem; color: #484f58; }
.wave-cards { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
