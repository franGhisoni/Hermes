import { Router } from 'express';
import { requireAuth, requireAdmin, isDemoUser } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { getDemoTargets } from '../services/DemoService';

const router = Router();

router.use(requireAuth);

type TargetInput = {
    name?: string;
    type?: string;
    email?: string;
    apiUrl?: string;
    apiKey?: string;
    apiMode?: string;
    sectionMap?: unknown;
};

/** The integration key never leaves the server: clients only learn whether one is set. */
const toPublic = ({ apiKey, ...target }: any) => ({ ...target, hasApiKey: !!apiKey });

const normalizeSectionMap = (value: unknown): Record<string, string> | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('sectionMap debe ser un objeto { sección: slug }');
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key, slug]) => key.trim() && typeof slug === 'string' && slug.trim())
        .map(([key, slug]) => [key.trim(), (slug as string).trim()]);
    return entries.length ? Object.fromEntries(entries) : null;
};

/** Validates the body for either target type and returns the columns to write. */
const buildTargetData = (input: TargetInput, partial: boolean) => {
    const type = input.type === 'IMPACTO_API' ? 'IMPACTO_API' : 'EMAIL';
    const data: Record<string, unknown> = { type };
    if (input.name !== undefined) data.name = input.name;

    if (type === 'IMPACTO_API') {
        if (!partial && (!input.apiUrl || !input.apiKey)) throw new Error('apiUrl y apiKey son obligatorios para un destino IMPACTO_API');
        if (input.apiUrl !== undefined) {
            const url = input.apiUrl.trim();
            if (!/^https?:\/\//i.test(url)) throw new Error('apiUrl debe empezar con http:// o https://');
            data.apiUrl = url.replace(/\/+$/, '');
        }
        // An empty key on edit means "keep the current one".
        if (input.apiKey) data.apiKey = input.apiKey.trim();
        if (input.apiMode !== undefined) data.apiMode = input.apiMode === 'IN_REVIEW' ? 'IN_REVIEW' : 'DRAFT';
        const sectionMap = normalizeSectionMap(input.sectionMap);
        if (sectionMap !== undefined) data.sectionMap = sectionMap === null ? null : sectionMap;
        data.email = null;
    } else {
        if (!partial && !input.email) throw new Error('email es obligatorio');
        if (input.email !== undefined) data.email = input.email;
        data.apiUrl = null;
        data.apiKey = null;
        data.sectionMap = null;
    }
    return data;
};

// GET /api/targets
router.get('/', async (req, res) => {
    try {
        if (isDemoUser(req)) return res.json(getDemoTargets());

        const targets = await prisma.target.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(targets.map(toPublic));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch targets' });
    }
});

// POST /api/targets
router.post('/', requireAdmin, async (req, res) => {
    const input: TargetInput = req.body;
    if (!input.name) return res.status(400).json({ error: 'Name is required' });

    try {
        const target = await prisma.target.create({
            data: buildTargetData(input, false) as any
        });
        res.json(toPublic(target));
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Target name already exists' });
        }
        if (error instanceof Error && !(error as any).code) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to create target' });
    }
});

// PUT /api/targets/:id
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        // Editing never changes the type implicitly: fall back to the stored one.
        const input: TargetInput = { ...req.body };
        if (!input.type) {
            const existing = await prisma.target.findUnique({ where: { id: req.params.id }, select: { type: true } });
            input.type = existing?.type;
        }
        const target = await prisma.target.update({
            where: { id: req.params.id },
            data: buildTargetData(input, true) as any
        });
        res.json(toPublic(target));
    } catch (error: any) {
        if (error instanceof Error && !(error as any).code) {
            return res.status(400).json({ error: error.message });
        }
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
