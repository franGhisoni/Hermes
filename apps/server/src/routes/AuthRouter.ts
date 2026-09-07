import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middlewares/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'hermes_super_secret_key_123!';

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                vorknewsUsername: user.vorknewsUsername,
                vorknewsAuthorName: user.vorknewsAuthorName,
                hasVorknewsPassword: Boolean(user.vorknewsPassword)
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res) => {
    // If it passes requireAuth, the token is valid and user is attached
    res.json({ user: req.user });
});

// PUT /api/auth/me/vorknews - Update own Vorknews credentials
router.put('/me/vorknews', requireAuth, async (req: AuthRequest, res) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const { vorknewsUsername, vorknewsPassword, vorknewsAuthorName } = req.body;

    const data: any = {};
    if (vorknewsUsername !== undefined) data.vorknewsUsername = vorknewsUsername ? String(vorknewsUsername).trim() : null;
    if (vorknewsAuthorName !== undefined) data.vorknewsAuthorName = vorknewsAuthorName ? String(vorknewsAuthorName).trim() : null;
    if (vorknewsPassword !== undefined && vorknewsPassword !== '') {
        data.vorknewsPassword = String(vorknewsPassword).trim();
    } else if (vorknewsPassword === null) {
        data.vorknewsPassword = null;
    }

    try {
        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: {
                id: true,
                username: true,
                role: true,
                vorknewsUsername: true,
                vorknewsPassword: true,
                vorknewsAuthorName: true
            }
        });

        res.json({
            success: true,
            user: {
                id: updated.id,
                username: updated.username,
                role: updated.role,
                vorknewsUsername: updated.vorknewsUsername,
                vorknewsAuthorName: updated.vorknewsAuthorName,
                hasVorknewsPassword: Boolean(updated.vorknewsPassword)
            }
        });
    } catch (error) {
        console.error('Error updating Vorknews credentials:', error);
        res.status(500).json({ error: 'Failed to update Vorknews credentials' });
    }
});

export default router;
