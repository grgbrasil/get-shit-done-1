import { GSDTools, resolveGsdToolsPath } from '../../dist/gsd-tools.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
export function createTools(projectDir) {
    return new GSDTools({
        projectDir,
        gsdToolsPath: resolveGsdToolsPath(projectDir),
    });
}
export async function getOverview(projectDir) {
    const tools = createTools(projectDir);
    let state = null;
    try {
        state = await tools.stateLoad();
    }
    catch {
        // STATE.md may not exist
    }
    let roadmap = null;
    try {
        roadmap = await tools.roadmapAnalyze();
    }
    catch {
        // ROADMAP.md may not exist
    }
    return { state, roadmap };
}
export async function getPhases(projectDir) {
    const tools = createTools(projectDir);
    const roadmap = await tools.roadmapAnalyze();
    const phaseDetails = {};
    for (const phase of roadmap.phases) {
        try {
            phaseDetails[phase.number] = await tools.phasePlanIndex(phase.number);
        }
        catch {
            // Phase may not have plans yet
        }
    }
    return { roadmap, phaseDetails };
}
export async function getPhaseDetail(projectDir, phaseNumber) {
    const tools = createTools(projectDir);
    return tools.phasePlanIndex(phaseNumber);
}
export async function getConfig(projectDir) {
    const configPath = join(projectDir, '.planning', 'config.json');
    if (!existsSync(configPath))
        return null;
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw);
}
//# sourceMappingURL=gsd-bridge.js.map