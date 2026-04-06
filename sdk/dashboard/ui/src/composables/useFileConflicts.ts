import { computed, type Ref } from 'vue';
import type { PlanInfo } from '../api';

export interface ConflictGroup {
  files: string[];
  planIds: string[];
  color: string;
}

const CLUSTER_COLORS = ['#f97316', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b'];

export function useFileConflicts(plans: Ref<PlanInfo[]>) {
  const conflicts = computed<ConflictGroup[]>(() => {
    const groups: ConflictGroup[] = [];
    const checked = new Set<string>();

    for (let i = 0; i < plans.value.length; i++) {
      const planA = plans.value[i];
      if (checked.has(planA.id)) continue;

      const overlapping: string[] = [planA.id];
      const sharedFiles = new Set<string>();

      for (let j = i + 1; j < plans.value.length; j++) {
        const planB = plans.value[j];
        const common = planA.files_modified.filter((f: string) => planB.files_modified.includes(f));
        if (common.length > 0) {
          overlapping.push(planB.id);
          common.forEach((f: string) => sharedFiles.add(f));
          checked.add(planB.id);
        }
      }

      if (overlapping.length > 1) {
        groups.push({
          files: [...sharedFiles],
          planIds: overlapping,
          color: CLUSTER_COLORS[groups.length % CLUSTER_COLORS.length],
        });
      }

      checked.add(planA.id);
    }

    return groups;
  });

  function getConflictForPlan(planId: string): ConflictGroup | undefined {
    return conflicts.value.find((g: ConflictGroup) => g.planIds.includes(planId));
  }

  return { conflicts, getConflictForPlan };
}
