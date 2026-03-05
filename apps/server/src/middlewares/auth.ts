import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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

        // 3. Attach user to request
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role
        };

        // Ensure user still exists
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

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
