import { GSDTools } from '../../src/gsd-tools.js';
import type { RoadmapAnalysis, PhasePlanIndex } from '../../src/types.js';
export declare function createTools(projectDir: string): GSDTools;
export declare function getOverview(projectDir: string): Promise<{
    state: string | null;
    roadmap: RoadmapAnalysis | null;
}>;
export declare function getPhases(projectDir: string): Promise<{
    roadmap: RoadmapAnalysis;
    phaseDetails: Record<string, PhasePlanIndex>;
}>;
export declare function getPhaseDetail(projectDir: string, phaseNumber: string): Promise<PhasePlanIndex>;
export declare function getConfig(projectDir: string): Promise<unknown>;
//# sourceMappingURL=gsd-bridge.d.ts.map