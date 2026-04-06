<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { usePhasesStore } from '../stores/phases';

const route = useRoute();
const router = useRouter();
const projectsStore = useProjectsStore();
const phasesStore = usePhasesStore();

interface Crumb {
  label: string;
  to?: string;
}

const crumbs = computed<Crumb[]>(() => {
  const result: Crumb[] = [];
  const projectId = route.params.projectId as string | undefined;
  if (!projectId) return result;

  const project = projectsStore.projects.find((p) => p.id === projectId);
  const projectName = project?.name ?? projectId;

  result.push({
    label: projectName,
    to: `/project/${projectId}`,
  });

  const phaseNumber = route.params.phaseId as string | undefined;
  if (phaseNumber) {
    const phase = phasesStore.phases.find((p) => p.number === phaseNumber);
    const phaseName = phase?.phase_name ?? `Phase ${phaseNumber}`;
    result.push({
      label: phaseName,
      to: `/project/${projectId}/phase/${phaseNumber}`,
    });
  }

  const planId = route.params.planId as string | undefined;
  if (planId) {
    result.push({ label: planId });
  }

  // Mark last crumb as current (no link)
  if (result.length > 0) {
    delete result[result.length - 1].to;
  }

  return result;
});

function navigate(to: string) {
  router.push(to);
}
</script>

<template>
  <nav v-if="crumbs.length" class="breadcrumb">
    <template v-for="(crumb, i) in crumbs" :key="i">
      <span v-if="i > 0" class="separator">/</span>
      <a
        v-if="crumb.to"
        class="crumb-link"
        @click.prevent="navigate(crumb.to)"
      >
        {{ crumb.label }}
      </a>
      <span v-else class="crumb-current">{{ crumb.label }}</span>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #30363d;
  background: #161b22;
  font-size: 0.85rem;
}

.separator {
  color: #484f58;
}

.crumb-link {
  color: #58a6ff;
  cursor: pointer;
  text-decoration: none;
}

.crumb-link:hover {
  text-decoration: underline;
}

.crumb-current {
  color: #e1e4e8;
}
</style>
