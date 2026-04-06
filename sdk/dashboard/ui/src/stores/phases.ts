import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type RoadmapPhase, type PhasePlanIndex } from '../api';

export const usePhasesStore = defineStore('phases', () => {
  const phases = ref<RoadmapPhase[]>([]);
  const phaseDetails = ref<Record<string, PhasePlanIndex>>({});
  const loading = ref(false);

  async function loadPhases(projectId: string) {
    loading.value = true;
    try {
      const data = await api.phases.list(projectId);
      phases.value = data.roadmap.phases;
      phaseDetails.value = data.phaseDetails;
    } finally {
      loading.value = false;
    }
  }

  async function loadPhaseDetail(projectId: string, phaseId: string) {
    const detail = await api.phases.get(projectId, phaseId);
    phaseDetails.value[phaseId] = detail;
    return detail;
  }

  return { phases, phaseDetails, loading, loadPhases, loadPhaseDetail };
});
