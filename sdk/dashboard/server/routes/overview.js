import { Router } from 'express';
import { getOverview } from '../gsd-bridge.js';
export function overviewRouter(registry) {
    const router = Router({ mergeParams: true });
    router.get('/', async (req, res) => {
        const project = await registry.get(req.params.id);
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        try {
            const overview = await getOverview(project.path);
            res.json(overview);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
//# sourceMappingURL=overview.js.map