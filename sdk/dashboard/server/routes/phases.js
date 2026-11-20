import { Router } from 'express';
import { getPhases, getPhaseDetail } from '../gsd-bridge.js';
export function phasesRouter(registry) {
    const router = Router({ mergeParams: true });
    router.get('/', async (req, res) => {
        const project = await registry.get(req.params.id);
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        try {
            const data = await getPhases(project.path);
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.get('/:phaseId', async (req, res) => {
        const project = await registry.get(req.params.id);
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        try {
            const detail = await getPhaseDetail(project.path, req.params.phaseId);
            res.json(detail);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
//# sourceMappingURL=phases.js.map