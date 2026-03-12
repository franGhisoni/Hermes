import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth, requireAdmin);

// GET /api/workflows
router.get('/', async (req, res) => {
    try {
        const workflows = await prisma.workflow.findMany({
            include: { targets: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(workflows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflows' });
    }
});

// exported instance from index
import { schedulerService } from '../index';

// POST /api/workflows
router.post('/', async (req, res) => {
    const { name, section, sources, minScore, targetCategory, cron, targetIds, maxArticles } = req.body;
    if (!name || !cron || !targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
        return res.status(400).json({ error: 'name, cron, and at least one targetId are required' });
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
                maxArticles: maxArticles ? parseInt(maxArticles) : 3,
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
    const { name, section, sources, minScore, targetCategory, cron, targetIds, isActive, maxArticles } = req.body;

    if (targetIds && (!Array.isArray(targetIds) || targetIds.length === 0)) {
        return res.status(400).json({ error: 'targetIds must be a non-empty array' });
    }

    try {
        const data: any = {
            name,
            section: section || null,
            sources: Array.isArray(sources) ? sources : [],
            minScore: minScore ? parseInt(minScore) : null,
            targetCategory: targetCategory || null,
            cron,
            maxArticles: maxArticles ? parseInt(maxArticles) : undefined,
            isActive
        };

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
