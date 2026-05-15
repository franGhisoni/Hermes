import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth, requireAdmin);

// Returns:
//   - undefined if the client did not include the field (don't touch DB)
//   - null     if the client explicitly cleared it (use system default)
//   - number   if a valid positive integer was provided
//   - 'invalid' on parse failure (router responds 400)
function parseArticleWindow(value: unknown): number | null | undefined | 'invalid' {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 'invalid';
    return parsed;
}

// GET /api/workflows
router.get('/', async (req, res) => {
    try {
        const workflows = await prisma.workflow.findMany({
            include: {
                targets: true,
                runs: { orderBy: { startedAt: 'desc' }, take: 1 }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(workflows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflows' });
    }
});

// GET /api/workflows/runs — recent runs across all workflows (for the
// global Historial view). Defined BEFORE /:id/runs so Express doesn't try
// to interpret "runs" as a workflow id.
router.get('/runs', async (req, res) => {
    try {
        const take = Math.min(parseInt(String(req.query.take ?? '60'), 10) || 60, 200);
        const runs = await prisma.workflowRun.findMany({
            orderBy: { startedAt: 'desc' },
            take,
            include: {
                workflow: {
                    select: { id: true, name: true }
                }
            }
        });
        res.json(runs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflow runs' });
    }
});

// GET /api/workflows/:id/runs
router.get('/:id/runs', async (req, res) => {
    try {
        const runs = await prisma.workflowRun.findMany({
            where: { workflowId: req.params.id },
            orderBy: { startedAt: 'desc' },
            take: 20
        });
        res.json(runs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflow runs' });
    }
});

// exported instance from index
import { schedulerService } from '../index';

// POST /api/workflows
router.post('/', async (req, res) => {
    const { name, section, sources, minScore, targetCategory, cron, targetIds, allowRepublish, articleWindowHours } = req.body;
    if (!name || !cron || !targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
        return res.status(400).json({ error: 'name, cron, and at least one targetId are required' });
    }

    const parsedWindow = parseArticleWindow(articleWindowHours);
    if (parsedWindow === 'invalid') {
        return res.status(400).json({ error: 'articleWindowHours must be a positive integer' });
    }

    try {
        const workflow = await prisma.workflow.create({
            data: {
                name,
                section: section || null,
                sources: Array.isArray(sources) ? sources : [],
                minScore: minScore ? parseInt(minScore) : null,
                targetCategory: targetCategory || null,
                cron,
                articleWindowHours: parsedWindow,
                allowRepublish: Boolean(allowRepublish),
                targets: { connect: targetIds.map((id: string) => ({ id })) },
                isActive: true
            },
            include: { targets: true }
        });
        schedulerService.scheduleWorkflow(workflow);
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create workflow' });
    }
});

// PUT /api/workflows/:id
router.put('/:id', async (req, res) => {
    const { name, section, sources, minScore, targetCategory, cron, targetIds, isActive, allowRepublish, articleWindowHours } = req.body;

    if (targetIds && (!Array.isArray(targetIds) || targetIds.length === 0)) {
        return res.status(400).json({ error: 'targetIds must be a non-empty array' });
    }

    const parsedWindow = parseArticleWindow(articleWindowHours);
    if (parsedWindow === 'invalid') {
        return res.status(400).json({ error: 'articleWindowHours must be a positive integer' });
    }

    try {
        const data: any = {
            name,
            section: section || null,
            sources: Array.isArray(sources) ? sources : [],
            minScore: minScore ? parseInt(minScore) : null,
            targetCategory: targetCategory || null,
            cron,
            isActive
        };

        if (articleWindowHours !== undefined) {
            data.articleWindowHours = parsedWindow;
        }

        if (typeof allowRepublish === 'boolean') {
            data.allowRepublish = allowRepublish;
        }

        if (targetIds) {
            data.targets = { set: targetIds.map((id: string) => ({ id })) };
        }

        const workflow = await prisma.workflow.update({
            where: { id: req.params.id },
            data,
            include: { targets: true }
        });
        schedulerService.scheduleWorkflow(workflow);
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update workflow' });
    }
});

// DELETE /api/workflows/:id
router.delete('/:id', async (req, res) => {
    try {
        await prisma.workflow.delete({
            where: { id: req.params.id }
        });
        schedulerService.unscheduleWorkflow(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete workflow' });
    }
});

export default router;
