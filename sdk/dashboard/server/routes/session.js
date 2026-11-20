import { Router } from 'express';
export function sessionRouter(registry, sessionManager, baseWsPort) {
    const router = Router({ mergeParams: true });
    router.post('/start', async (req, res) => {
        const project = await registry.get(req.params.id);
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        try {
            const result = sessionManager.start(project.id, project.path, baseWsPort);
            res.json(result);
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    router.delete('/stop', async (req, res) => {
        try {
            sessionManager.stop(req.params.id);
            res.status(204).end();
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    router.get('/status', (req, res) => {
        const status = sessionManager.status(req.params.id);
        res.json(status);
    });
    return router;
}
//# sourceMappingURL=session.js.map