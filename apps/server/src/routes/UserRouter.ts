import { Router } from 'express';
import bcrypt from 'bcrypt';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// All user routes require Auth and Admin role
router.use(requireAuth, requireAdmin);

// GET /api/users
router.get('/', async (req: AuthRequest, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                role: true,
                createdAt: true,
                vorknewsUsername: true,
                vorknewsAuthorName: true,
                vorknewsPassword: true
            },
            orderBy: { username: 'asc' }
        });
        const mapped = users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            createdAt: u.createdAt,
            vorknewsUsername: u.vorknewsUsername,
            vorknewsAuthorName: u.vorknewsAuthorName,
            hasVorknewsPassword: Boolean(u.vorknewsPassword)
        }));
        res.json(mapped);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST /api/users
router.post('/', async (req, res) => {
    const { username, password, role, vorknewsUsername, vorknewsPassword, vorknewsAuthorName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) return res.status(400).json({ error: 'Username already taken' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                passwordHash,
                role: role === 'ADMIN' ? 'ADMIN' : role === 'DEMO' ? 'DEMO' : 'EDITOR',
                vorknewsUsername: vorknewsUsername ? String(vorknewsUsername).trim() : null,
                vorknewsPassword: vorknewsPassword ? String(vorknewsPassword).trim() : null,
                vorknewsAuthorName: vorknewsAuthorName ? String(vorknewsAuthorName).trim() : null
            },
            select: {
                id: true,
                username: true,
                role: true,
                vorknewsUsername: true,
                vorknewsAuthorName: true,
                vorknewsPassword: true
            }
        });

        res.json({
            id: user.id,
            username: user.username,
            role: user.role,
            vorknewsUsername: user.vorknewsUsername,
            vorknewsAuthorName: user.vorknewsAuthorName,
            hasVorknewsPassword: Boolean(user.vorknewsPassword)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// PUT /api/users/:id - Update user profile / vorknews credentials
router.put('/:id', async (req, res) => {
    const { role, vorknewsUsername, vorknewsPassword, vorknewsAuthorName } = req.body;

    const data: any = {};
    if (role && ['ADMIN', 'EDITOR', 'DEMO'].includes(role)) {
        data.role = role;
    }
    if (vorknewsUsername !== undefined) {
        data.vorknewsUsername = vorknewsUsername ? String(vorknewsUsername).trim() : null;
    }
    if (vorknewsAuthorName !== undefined) {
        data.vorknewsAuthorName = vorknewsAuthorName ? String(vorknewsAuthorName).trim() : null;
    }
    if (vorknewsPassword !== undefined) {
        if (vorknewsPassword === '' || vorknewsPassword === null) {
            data.vorknewsPassword = null;
        } else {
            data.vorknewsPassword = String(vorknewsPassword).trim();
        }
    }

    try {
        const updated = await prisma.user.update({
            where: { id: req.params.id },
            data,
            select: {
                id: true,
                username: true,
                role: true,
                createdAt: true,
                vorknewsUsername: true,
                vorknewsAuthorName: true,
                vorknewsPassword: true
            }
        });

        res.json({
            id: updated.id,
            username: updated.username,
            role: updated.role,
            createdAt: updated.createdAt,
            vorknewsUsername: updated.vorknewsUsername,
            vorknewsAuthorName: updated.vorknewsAuthorName,
            hasVorknewsPassword: Boolean(updated.vorknewsPassword)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
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
