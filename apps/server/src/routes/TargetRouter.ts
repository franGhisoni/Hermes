import { Router } from 'express';
import { requireAuth, requireAdmin, isDemoUser } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { getDemoTargets } from '../services/DemoService';

const router = Router();

router.use(requireAuth);

// GET /api/targets
router.get('/', async (req, res) => {
    try {
        if (isDemoUser(req)) return res.json(getDemoTargets());

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
    const { name, email, type = 'EMAIL', config } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (type === 'EMAIL' && !email) return res.status(400).json({ error: 'Email is required for EMAIL target' });

    try {
        const target = await prisma.target.create({
            data: {
                name,
                email: email || null,
                type: type || 'EMAIL',
                config: config || undefined
            }
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
    const { name, email, type, config } = req.body;
    try {
        const data: any = {};
        if (name !== undefined) data.name = name;
        if (email !== undefined) data.email = email;
        if (type !== undefined) data.type = type;
        if (config !== undefined) data.config = config;

        const target = await prisma.target.update({
            where: { id: req.params.id },
            data
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
