import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/targets
router.get('/', async (req, res) => {
    try {
        const targets = await prisma.target.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(targets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch targets' });
    }
});

// POST /api/targets
router.post('/', requireAdmin, async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    try {
        const target = await prisma.target.create({
            data: { name, email }
        });
        res.json(target);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Target name already exists' });
        }
        res.status(500).json({ error: 'Failed to create target' });
    }
});

// PUT /api/targets/:id
router.put('/:id', requireAdmin, async (req, res) => {
    const { name, email } = req.body;
    try {
        const target = await prisma.target.update({
            where: { id: req.params.id },
            data: { name, email }
        });
        res.json(target);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update target' });
    }
});

// DELETE /api/targets/:id
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await prisma.target.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete target' });
    }
});

export default router;
