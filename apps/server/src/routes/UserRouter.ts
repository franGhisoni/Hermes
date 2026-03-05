import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

// All user routes require Auth and Admin role
router.use(requireAuth, requireAdmin);

// GET /api/users
router.get('/', async (req: AuthRequest, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, role: true, createdAt: true }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST /api/users
router.post('/', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) return res.status(400).json({ error: 'Username already taken' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                passwordHash,
                role: role === 'ADMIN' ? 'ADMIN' : 'EDITOR'
            },
            select: { id: true, username: true, role: true }
        });

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// PUT /api/users/:id/password
router.put('/:id/password', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'New password required' });

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: req.params.id },
            data: { passwordHash }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// DELETE /api/users/:id
router.delete('/:id', async (req: AuthRequest, res) => {
    if (req.params.id === req.user?.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
