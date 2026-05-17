import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// GET /api/config/sections
// Returns global sections with their per-source overrides nested. Available
// to any authenticated user (e.g. ScraperControl on the header needs to know
// which sections to show in the hover submenu).
router.get('/', async (req, res) => {
    try {
        const sections = await prisma.section.findMany({
            orderBy: [
                { name: 'asc' }
            ],
            include: { overrides: true }
        });
        res.json(sections);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// GET /api/config/sections/effective?source=Clarin
// Returns the effective section set for a specific source: global section
// merged with its override (path, scrapeLimit, enabled). Disabled sections
// are included with `enabled: false` so callers can show them greyed out.
router.get('/effective', async (req, res) => {
    const source = String(req.query.source || '').trim();
    if (!source) return res.status(400).json({ error: 'Missing source' });

    try {
        const sections = await prisma.section.findMany({
            orderBy: [{ name: 'asc' }],
            include: {
                overrides: { where: { source } }
            }
        });

        const effective = sections.map(sec => {
            const override = sec.overrides[0];
            return {
                id: sec.id,
                name: sec.name,
                path: override?.path ?? sec.path,
                scrapeLimit: override?.scrapeLimit ?? sec.scrapeLimit,
                enabled: override ? override.enabled : true,
                hasOverride: !!override
            };
        });
        res.json(effective);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch effective sections' });
    }
});

// POST /api/config/sections
router.post('/', requireAdmin, async (req, res) => {
    const { name, path, scrapeLimit } = req.body;
    if (!name || !path) return res.status(400).json({ error: 'Name and path are required' });

    try {
        const section = await prisma.section.create({
            data: {
                name,
                path,
                scrapeLimit: normalizeLimit(scrapeLimit)
            }
        });
        res.json(section);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Section name already exists' });
        }
        res.status(500).json({ error: 'Failed to create section' });
    }
});

// PUT /api/config/sections/:id
router.put('/:id', requireAdmin, async (req, res) => {
    const { name, path, scrapeLimit } = req.body;

    try {
        const data: any = {};
        if (typeof name === 'string') data.name = name;
        if (typeof path === 'string') data.path = path;
        if (scrapeLimit !== undefined) data.scrapeLimit = normalizeLimit(scrapeLimit);

        const section = await prisma.section.update({
            where: { id: req.params.id },
            data
        });
        res.json(section);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Section name already exists' });
        }
        res.status(500).json({ error: 'Failed to update section' });
    }
});

function normalizeLimit(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = parseInt(String(raw), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(parsed, 100);
}

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

// PUT /api/config/sections/:id/overrides/:source
// Upsert an override for (section, source). Body: { path?, scrapeLimit?, enabled? }.
// An override row exists either to customize a field OR to disable the section
// for that source.
router.put('/:id/overrides/:source', requireAdmin, async (req, res) => {
    const { id, source } = req.params;
    const { path, scrapeLimit, enabled } = req.body ?? {};

    const data = {
        path: typeof path === 'string' && path.trim() !== '' ? path.trim() : null,
        scrapeLimit: normalizeLimit(scrapeLimit),
        enabled: typeof enabled === 'boolean' ? enabled : true
    };

    try {
        const override = await prisma.sectionOverride.upsert({
            where: { sectionId_source: { sectionId: id, source } },
            create: { sectionId: id, source, ...data },
            update: data
        });
        res.json(override);
    } catch (error) {
        console.error('Failed to upsert section override:', error);
        res.status(500).json({ error: 'Failed to save override' });
    }
});

// DELETE /api/config/sections/:id/overrides/:source
// Remove the override, reverting the section to defaults for that source.
router.delete('/:id/overrides/:source', requireAdmin, async (req, res) => {
    const { id, source } = req.params;
    try {
        await prisma.sectionOverride.deleteMany({
            where: { sectionId: id, source }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove override' });
    }
});

export default router;
