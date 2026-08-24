import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'hermes_super_secret_key_123!';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
        role: string;
    };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Extract token from header 'Authorization: Bearer <token>'
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // 2. Verify token
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        // 3. Resolve the current user from the database. In particular, do
        // not trust a stale role embedded in a long-lived JWT.
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, username: true, role: true }
        });
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        req.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: Requires Admin role' });
    }
    next();
};

export const isDemoUser = (req: Request) => (req as AuthRequest).user?.role === 'DEMO';

/**
 * Demo accounts can browse authenticated GET endpoints, but they cannot
 * mutate anything even if a request is crafted outside the frontend.
 */
export const requireReadOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role === 'DEMO' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return res.status(403).json({ error: 'Demo accounts are read-only' });
    }
    next();
};
