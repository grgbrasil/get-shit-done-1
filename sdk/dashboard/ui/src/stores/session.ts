import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type SessionStatus } from '../api';

export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>({ active: false });
  const loading = ref(false);

  async function checkStatus(projectId: string) {
    try {
      status.value = await api.session.status(projectId);
    } catch {
      status.value = { active: false };
    }
  }

  async function start(projectId: string) {
    loading.value = true;
    try {
      const result = await api.session.start(projectId);
      status.value = { active: true, pid: result.pid, wsPort: result.wsPort };
    } finally {
      loading.value = false;
    }
  }

  async function stop(projectId: string) {
    loading.value = true;
    try {
      await api.session.stop(projectId);
      status.value = { active: false };
    } finally {
      loading.value = false;
    }
  }

  return { status, loading, checkStatus, start, stop };
});
