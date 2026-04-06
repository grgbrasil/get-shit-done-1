<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { usePhasesStore } from '../stores/phases';
import SessionIndicator from './SessionIndicator.vue';

const router = useRouter();
const projectsStore = useProjectsStore();
const phasesStore = usePhasesStore();

const expandedProjects = ref<Set<string>>(new Set());
const expandedSections = ref<Set<string>>(new Set());
const expandedPhases = ref<Set<string>>(new Set());
const showAddForm = ref(false);
const newProjectPath = ref('');

onMounted(() => {
  projectsStore.load();
});

function toggleProject(id: string) {
  if (expandedProjects.value.has(id)) {
    expandedProjects.value.delete(id);
  } else {
    expandedProjects.value.add(id);
    projectsStore.setActive(id);
    phasesStore.loadPhases(id);
  }
}

function toggleSection(key: string) {
  if (expandedSections.value.has(key)) {
    expandedSections.value.delete(key);
  } else {
    expandedSections.value.add(key);
  }
}

function togglePhase(key: string) {
  if (expandedPhases.value.has(key)) {
    expandedPhases.value.delete(key);
  } else {
    expandedPhases.value.add(key);
  }
}

function navigateTo(path: string) {
  router.push(path);
}

async function addProject() {
  const path = newProjectPath.value.trim();
  if (!path) return;
  await projectsStore.addProject(path);
  newProjectPath.value = '';
  showAddForm.value = false;
}

function statusColor(phase: { disk_status: string; roadmap_complete: boolean }): string {
  if (phase.roadmap_complete) return '#3fb950';
  if (phase.disk_status === 'has_plan') return '#d29922';
  if (phase.disk_status === 'dir_only') return '#58a6ff';
  return '#484f58';
}

watch(
  () => projectsStore.activeProjectId,
  (id) => {
    if (id && !expandedProjects.value.has(id)) {
      expandedProjects.value.add(id);
      phasesStore.loadPhases(id);
    }
  },
);
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">GSD</span>
    </div>

    <div class="sidebar-body">
      <div v-for="project in projectsStore.projects" :key="project.id" class="project-item">
        <!-- Level 1: Project -->
        <div
          class="nav-row project-row"
          :class="{ active: projectsStore.activeProjectId === project.id }"
          @click="toggleProject(project.id)"
        >
          <span class="chevron" :class="{ expanded: expandedProjects.has(project.id) }">▸</span>
          <span class="nav-label">{{ project.name }}</span>
        </div>

        <!-- Level 2: Sections -->
        <div v-if="expandedProjects.has(project.id)" class="level-2">
          <div
            class="nav-row section-row"
            @click="navigateTo(`/project/${project.id}`)"
          >
            <span class="nav-icon">◉</span>
            <span class="nav-label">State</span>
          </div>

          <div
            class="nav-row section-row"
            @click="navigateTo(`/project/${project.id}/roadmap`)"
          >
            <span class="nav-icon">◎</span>
            <span class="nav-label">Roadmap</span>
          </div>

          <!-- Phases section -->
          <div
            class="nav-row section-row"
            @click="toggleSection(`${project.id}:phases`)"
          >
            <span class="chevron" :class="{ expanded: expandedSections.has(`${project.id}:phases`) }">▸</span>
            <span class="nav-label">Phases</span>
          </div>

          <!-- Level 3: Individual phases -->
          <div v-if="expandedSections.has(`${project.id}:phases`)" class="level-3">
            <div
              v-for="phase in phasesStore.phases"
              :key="phase.number"
              class="phase-group"
            >
              <div
                class="nav-row phase-row"
                @click="togglePhase(`${project.id}:${phase.number}`)"
              >
                <span class="chevron" :class="{ expanded: expandedPhases.has(`${project.id}:${phase.number}`) }">▸</span>
                <span class="status-dot" :style="{ background: statusColor(phase) }" />
                <span
                  class="nav-label"
                  @click.stop="navigateTo(`/project/${project.id}/phase/${phase.number}`)"
                >
                  {{ phase.number }}. {{ phase.phase_name }}
                </span>
              </div>

              <!-- Level 4: Plans within phase -->
              <div
                v-if="expandedPhases.has(`${project.id}:${phase.number}`) && phasesStore.phaseDetails[phase.number]"
                class="level-4"
              >
                <div
                  v-for="plan in phasesStore.phaseDetails[phase.number].plans"
                  :key="plan.id"
                  class="nav-row plan-row"
                  @click="navigateTo(`/project/${project.id}/phase/${phase.number}/plan/${plan.id}`)"
                >
                  <span class="nav-label plan-label">{{ plan.id }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            class="nav-row section-row"
            @click="navigateTo(`/project/${project.id}/config`)"
          >
            <span class="nav-icon">⚙</span>
            <span class="nav-label">Config</span>
          </div>
        </div>
      </div>

      <!-- Add project -->
      <div class="add-project">
        <button v-if="!showAddForm" class="add-btn" @click="showAddForm = true">
          + Add Project
        </button>
        <form v-else class="add-form" @submit.prevent="addProject">
          <input
            v-model="newProjectPath"
            class="add-input"
            placeholder="/path/to/project"
            autofocus
            @keydown.esc="showAddForm = false"
          />
          <div class="add-actions">
            <button type="submit" class="add-confirm">Add</button>
            <button type="button" class="add-cancel" @click="showAddForm = false">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <SessionIndicator />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #161b22;
  border-right: 1px solid #30363d;
  overflow: hidden;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid #30363d;
}

.sidebar-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #58a6ff;
  letter-spacing: 0.05em;
}

.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.nav-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: #c9d1d9;
  transition: background 0.15s;
  user-select: none;
}

.nav-row:hover {
  background: #1c2128;
}

.nav-row.active {
  background: #1c2128;
  color: #58a6ff;
}

.chevron {
  font-size: 0.7rem;
  color: #484f58;
  transition: transform 0.15s;
  width: 12px;
  text-align: center;
}

.chevron.expanded {
  transform: rotate(90deg);
}

.nav-icon {
  font-size: 0.7rem;
  color: #484f58;
  width: 12px;
  text-align: center;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-2 {
  padding-left: 0.5rem;
}

.level-3 {
  padding-left: 0.5rem;
}

.level-4 {
  padding-left: 1.25rem;
}

.section-row {
  padding-left: 1.25rem;
}

.phase-row {
  padding-left: 1rem;
}

.plan-row {
  padding-left: 1.5rem;
}

.plan-label {
  font-size: 0.8rem;
  color: #8b949e;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Add project */
.add-project {
  padding: 0.5rem 0.75rem;
}

.add-btn {
  width: 100%;
  padding: 0.4rem;
  font-size: 0.8rem;
  background: none;
  border: 1px dashed #30363d;
  border-radius: 6px;
  color: #8b949e;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.add-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.add-input {
  width: 100%;
  padding: 0.4rem 0.5rem;
  font-size: 0.8rem;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  outline: none;
}

.add-input:focus {
  border-color: #58a6ff;
}

.add-actions {
  display: flex;
  gap: 0.4rem;
}

.add-confirm,
.add-cancel {
  flex: 1;
  padding: 0.3rem;
  font-size: 0.75rem;
  border: 1px solid #30363d;
  border-radius: 6px;
  cursor: pointer;
}

.add-confirm {
  background: #238636;
  color: #fff;
  border-color: #238636;
}

.add-confirm:hover {
  background: #2ea043;
}

.add-cancel {
  background: #21262d;
  color: #c9d1d9;
}

.add-cancel:hover {
  background: #30363d;
}
</style>
