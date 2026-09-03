import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { isDemoUser, AuthRequest } from '../middlewares/auth';
import { getDemoNotifications } from '../services/DemoService';

const router = Router();

// GET /api/notifications — list notifications (most recent first).
// Query params: take (default 50, max 200), unreadOnly=1 to filter.
// Basic users (role !== 'ADMIN') only see PUBLISH status notifications.
router.get('/', async (req: AuthRequest, res) => {
    try {
        if (isDemoUser(req)) return res.json(getDemoNotifications());

        const take = Math.min(parseInt(String(req.query.take ?? '50'), 10) || 50, 200);
        const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';

        const isBasicUser = req.user?.role !== 'ADMIN';
        const whereClause: any = {};
        if (unreadOnly) whereClause.readAt = null;
        if (isBasicUser) whereClause.source = 'PUBLISH';

        const [items, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                take
            }),
            prisma.notification.count({ where: whereClause })
        ]);

        res.json({ items, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// POST /api/notifications/read-all — mark all as read.
router.post('/read-all', async (req: AuthRequest, res) => {
    try {
        const isBasicUser = req.user?.role !== 'ADMIN';
        await prisma.notification.updateMany({
            where: {
                readAt: null,
                ...(isBasicUser ? { source: 'PUBLISH' } : {})
            },
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
