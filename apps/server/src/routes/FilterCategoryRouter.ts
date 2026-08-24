import { Router } from 'express';
import { requireAdmin } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
    try {
        const categories = await prisma.filterCategory.findMany({
            orderBy: { name: 'asc' },
            include: {
                sections: {
                    orderBy: { name: 'asc' },
                    include: { overrides: true }
                }
            }
        });
        res.json(categories);
    } catch (error) {
        console.error('Failed to fetch filter categories:', error);
        res.status(500).json({ error: 'Failed to fetch filter categories' });
    }
});

router.post('/', requireAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const category = await prisma.filterCategory.create({ data: { name } });
        res.json(category);
    } catch (error: any) {
        if (error.code === 'P2002') return res.status(400).json({ error: 'Filter category already exists' });
        res.status(500).json({ error: 'Failed to create filter category' });
    }
});

router.put('/:id', requireAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const category = await prisma.filterCategory.update({
            where: { id: req.params.id },
            data: { name }
        });
        res.json(category);
    } catch (error: any) {
        if (error.code === 'P2002') return res.status(400).json({ error: 'Filter category already exists' });
        if (error.code === 'P2025') return res.status(404).json({ error: 'Filter category not found' });
        res.status(500).json({ error: 'Failed to update filter category' });
    }
});

router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await prisma.filterCategory.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Filter category not found' });
        res.status(500).json({ error: 'Failed to delete filter category' });
    }
});

export default router;
