import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type Project } from '../api';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string | null>(null);
  const loading = ref(false);

  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeProjectId.value) ?? null,
  );

  async function load() {
    loading.value = true;
    try {
      projects.value = await api.projects.list();
    } finally {
      loading.value = false;
    }
  }

  async function addProject(path: string) {
    const project = await api.projects.add(path);
    projects.value.push(project);
    return project;
  }

  async function removeProject(id: string) {
    await api.projects.remove(id);
    projects.value = projects.value.filter((p) => p.id !== id);
    if (activeProjectId.value === id) {
      activeProjectId.value = null;
    }
  }

  function setActive(id: string) {
    activeProjectId.value = id;
  }

  return { projects, activeProjectId, activeProject, loading, load, addProject, removeProject, setActive };
});
