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
            include: { target: true },
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
    const { name, section, targetCategory, cron, targetId } = req.body;
    if (!name || !cron || !targetId) {
        return res.status(400).json({ error: 'name, cron, and targetId are required' });
    }

    try {
        const workflow = await prisma.workflow.create({
            data: { name, section: section || null, targetCategory: targetCategory || null, cron, targetId, isActive: true },
            include: { target: true }
        });
        schedulerService.scheduleWorkflow(workflow);
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create workflow' });
    }
});

// PUT /api/workflows/:id
router.put('/:id', async (req, res) => {
    const { name, section, targetCategory, cron, targetId, isActive } = req.body;
    try {
        const workflow = await prisma.workflow.update({
            where: { id: req.params.id },
            data: { name, section: section || null, targetCategory: targetCategory || null, cron, targetId, isActive },
            include: { target: true }
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
