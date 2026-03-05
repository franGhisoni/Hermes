import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/config/sections
// Available to any authenticated user (Editors need to see sections for Flows, if Flows page accessible to them. 
// Currently Flows is Admin only but reading sections is safe).
router.get('/', async (req, res) => {
    try {
        const sections = await prisma.section.findMany({
            orderBy: [
                { name: 'asc' }
            ]
        });
        res.json(sections);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// POST /api/config/sections
router.post('/', requireAdmin, async (req, res) => {
    const { name, path } = req.body;
    if (!name || !path) return res.status(400).json({ error: 'Name and path are required' });

    try {
        const section = await prisma.section.create({
            data: { name, path }
        });
        res.json(section);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Section name already exists' });
        }
        res.status(500).json({ error: 'Failed to create section' });
    }
});

// DELETE /api/config/sections/:id
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await prisma.section.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete section' });
    }
});

export default router;
