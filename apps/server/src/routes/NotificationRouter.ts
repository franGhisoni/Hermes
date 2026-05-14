import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/notifications — list notifications (most recent first).
// Query params: take (default 50, max 200), unreadOnly=1 to filter.
router.get('/', async (req, res) => {
    try {
        const take = Math.min(parseInt(String(req.query.take ?? '50'), 10) || 50, 200);
        const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';

        const [items, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: unreadOnly ? { readAt: null } : undefined,
                orderBy: { createdAt: 'desc' },
                take
            }),
            prisma.notification.count({ where: { readAt: null } })
        ]);

        res.json({ items, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// POST /api/notifications/read-all — mark all as read.
router.post('/read-all', async (_req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { readAt: null },
            data: { readAt: new Date() }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// POST /api/notifications/:id/read — mark single notification as read.
router.post('/:id/read', async (req, res) => {
    try {
        await prisma.notification.update({
            where: { id: req.params.id },
            data: { readAt: new Date() }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// DELETE /api/notifications/:id — delete a single notification.
router.delete('/:id', async (req, res) => {
    try {
        await prisma.notification.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// DELETE /api/notifications — clear all notifications.
router.delete('/', async (_req, res) => {
    try {
        await prisma.notification.deleteMany({});
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

export default router;
