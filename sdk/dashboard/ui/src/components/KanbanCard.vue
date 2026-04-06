<script setup lang="ts">
import { computed } from 'vue';
import type { PlanInfo } from '../api';

const props = defineProps<{
  plan: PlanInfo;
  conflictColor: string | null;
  conflictFiles: string[];
  isBlocked: boolean;
  isRunning: boolean;
}>();

const emit = defineEmits<{
  click: [planId: string];
}>();

type PlanStatus = 'completed' | 'in-progress' | 'ready' | 'blocked' | 'not-started';

const status = computed<PlanStatus>(() => {
  if (props.plan.has_summary) return 'completed';
  if (props.isRunning) return 'in-progress';
  if (props.isBlocked) return 'blocked';
  return 'ready';
});

const statusLabel: Record<PlanStatus, string> = {
  'completed': 'Completed',
  'in-progress': 'In Progress',
  'ready': 'Ready',
  'blocked': 'Blocked',
  'not-started': 'Not Started',
};

const statusClass: Record<PlanStatus, string> = {
  'completed': 'badge-completed',
  'in-progress': 'badge-progress',
  'ready': 'badge-ready',
  'blocked': 'badge-blocked',
  'not-started': 'badge-default',
};
</script>

<template>
  <div
    class="kanban-card"
    :class="{ 'card-running': isRunning }"
    @click="emit('click', plan.id)"
  >
    <div class="card-header">
      <span class="plan-id">{{ plan.id }}</span>
      <span
        v-if="conflictColor"
        class="conflict-dot"
        :style="{ background: conflictColor }"
        :title="'Shared files: ' + conflictFiles.join(', ')"
      ></span>
    </div>
    <div class="card-objective" v-if="plan.objective">{{ plan.objective }}</div>
    <div class="card-footer">
      <span class="badge" :class="statusClass[status]">{{ statusLabel[status] }}</span>
      <span class="task-count">{{ plan.task_count }} tasks</span>
    </div>
  </div>
</template>

<style scoped>
.kanban-card {
  background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  padding: 0.75rem; cursor: pointer; transition: border-color 0.2s, transform 0.2s;
}
.kanban-card:hover { border-color: #58a6ff; transform: translateY(-1px); }
.card-running {
  border-color: #58a6ff;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(88, 166, 255, 0); }
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.plan-id { font-weight: 600; font-size: 0.9rem; color: #e1e4e8; }
.conflict-dot { width: 10px; height: 10px; border-radius: 50%; cursor: help; }
.card-objective { font-size: 0.8rem; color: #8b949e; margin-bottom: 0.5rem; line-height: 1.3; }
.card-footer { display: flex; justify-content: space-between; align-items: center; }
.badge { font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 500; }
.badge-completed { background: #238636; color: #fff; }
.badge-progress { background: #1f6feb; color: #fff; }
.badge-ready { background: #196c2e; color: #3fb950; border: 1px solid #238636; }
.badge-blocked { background: #462c17; color: #d29922; }
.badge-default { background: #21262d; color: #8b949e; }
.task-count { font-size: 0.75rem; color: #484f58; }
</style>
