import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAdmin, isDemoUser } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { getDemoWorkflowRuns, getDemoWorkflows } from '../services/DemoService';

const router = Router();

// Returns:
//   - undefined if the client did not include the field (don't touch DB)
//   - null     if the client explicitly cleared it (use system default)
//   - number   if a valid positive integer was provided
//   - 'invalid' on parse failure (router responds 400)
function parseArticleWindow(value: unknown): number | null | undefined | 'invalid' {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 'invalid';
    return parsed;
}

type WorkflowTargetLimitInput = {
    targetId?: unknown;
    section?: unknown;
    limit?: unknown;
};

function parsePublicationLimit(value: unknown): number | 'invalid' {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : 'invalid';
}

function parseTargetLimits(value: unknown, targetIds: string[]): Array<{ targetId: string; section: string; limit: number }> | 'invalid' {
    const selected = new Set(targetIds);
    const rows = value === undefined ? [] : value;
    if (!Array.isArray(rows)) return 'invalid';

    const parsed: Array<{ targetId: string; section: string; limit: number }> = [];
    const seen = new Set<string>();
    for (const row of rows as WorkflowTargetLimitInput[]) {
        const targetId = typeof row?.targetId === 'string' ? row.targetId : '';
        const section = typeof row?.section === 'string' ? row.section.trim() : '';
        const limit = Number(row?.limit);
        if (!targetId || !selected.has(targetId) || !section || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
            return 'invalid';
        }
        const key = `${targetId}\u0000${section}`;
        if (seen.has(key)) return 'invalid';
        seen.add(key);
        parsed.push({ targetId, section, limit });
    }

    return parsed;
}

async function syncTargetLimits(
    workflowId: string,
    targetIds: string[],
    input: unknown,
    tx: Prisma.TransactionClient = prisma
) {
    const parsed = parseTargetLimits(input, targetIds);
    if (parsed === 'invalid') throw new Error('targetLimits must contain positive limits between 1 and 100 for selected targets');

    await tx.workflowTargetLimit.deleteMany({ where: { workflowId } });
    if (parsed.length > 0) {
        await tx.workflowTargetLimit.createMany({
            data: parsed.map(row => ({ workflowId, ...row }))
        });
    }
}

// GET /api/workflows
router.get('/', async (req, res) => {
    try {
        if (isDemoUser(req)) return res.json(getDemoWorkflows());

        const workflows = await prisma.workflow.findMany({
            include: {
                targets: true,
                targetLimits: { orderBy: [{ targetId: 'asc' }, { section: 'asc' }] },
                runs: { orderBy: { startedAt: 'desc' }, take: 1 }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(workflows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflows' });
    }
});

// GET /api/workflows/runs — recent runs across all workflows (for the
// global Historial view). Defined BEFORE /:id/runs so Express doesn't try
// to interpret "runs" as a workflow id.
router.get('/runs', async (req, res) => {
    try {
        if (isDemoUser(req)) return res.json(getDemoWorkflowRuns());

        const take = Math.min(parseInt(String(req.query.take ?? '60'), 10) || 60, 200);
        const runs = await prisma.workflowRun.findMany({
            orderBy: { startedAt: 'desc' },
            take,
            include: {
                workflow: {
                    select: { id: true, name: true }
                }
            }
        });
        res.json(runs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflow runs' });
    }
});

// GET /api/workflows/:id/runs
router.get('/:id/runs', async (req, res) => {
    try {
        if (isDemoUser(req)) {
            return res.json(getDemoWorkflowRuns().filter(run => run.workflow.id === req.params.id));
        }

        const runs = await prisma.workflowRun.findMany({
            where: { workflowId: req.params.id },
            orderBy: { startedAt: 'desc' },
            take: 20
        });
        res.json(runs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch workflow runs' });
    }
});

// exported instance from index
import { schedulerService } from '../index';

// POST /api/workflows
router.post('/', requireAdmin, async (req, res) => {
    const { name, section, sources, minScore, targetCategory, cron, targetIds, defaultArticleLimit, targetLimits, allowRepublish, articleWindowHours } = req.body;
    if (!name || !cron || !targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
        return res.status(400).json({ error: 'name, cron, and at least one targetId are required' });
    }

    const parsedWindow = parseArticleWindow(articleWindowHours);
    if (parsedWindow === 'invalid') {
        return res.status(400).json({ error: 'articleWindowHours must be a positive integer' });
    }
    const parsedDefaultLimit = parsePublicationLimit(defaultArticleLimit ?? 1);
    if (parsedDefaultLimit === 'invalid') {
        return res.status(400).json({ error: 'defaultArticleLimit debe ser un entero entre 1 y 100' });
    }
    const parsedLimits = parseTargetLimits(targetLimits, targetIds);
    if (parsedLimits === 'invalid') {
        return res.status(400).json({ error: 'targetLimits debe contener cantidades enteras entre 1 y 100 para los medios seleccionados' });
    }

    try {
        const workflow = await prisma.$transaction(async tx => {
            const created = await tx.workflow.create({
                data: {
                    name,
                    section: section || null,
                    sources: Array.isArray(sources) ? sources : [],
                    minScore: minScore ? parseInt(minScore) : null,
                    targetCategory: targetCategory || null,
                    cron,
                    defaultArticleLimit: parsedDefaultLimit,
                    articleWindowHours: parsedWindow,
                    allowRepublish: Boolean(allowRepublish),
                    targets: { connect: targetIds.map((id: string) => ({ id })) },
                    isActive: true
                },
                include: { targets: true }
            });
            await syncTargetLimits(created.id, targetIds, targetLimits, tx);
            return tx.workflow.findUnique({
                where: { id: created.id },
                include: { targets: true, targetLimits: true }
            });
        });
        schedulerService.scheduleWorkflow(workflow);
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create workflow' });
    }
});

// PUT /api/workflows/:id
router.put('/:id', requireAdmin, async (req, res) => {
    const { name, section, sources, minScore, targetCategory, cron, targetIds, defaultArticleLimit, targetLimits, isActive, allowRepublish, articleWindowHours } = req.body;

    if (targetIds && (!Array.isArray(targetIds) || targetIds.length === 0)) {
        return res.status(400).json({ error: 'targetIds must be a non-empty array' });
    }

    const parsedWindow = parseArticleWindow(articleWindowHours);
    if (parsedWindow === 'invalid') {
        return res.status(400).json({ error: 'articleWindowHours must be a positive integer' });
    }

    const parsedDefaultLimit = defaultArticleLimit === undefined
        ? undefined
        : parsePublicationLimit(defaultArticleLimit);
    if (parsedDefaultLimit === 'invalid') {
        return res.status(400).json({ error: 'defaultArticleLimit debe ser un entero entre 1 y 100' });
    }

    const selectedTargetIds = targetIds || (await prisma.workflow.findUnique({ where: { id: req.params.id }, select: { targets: { select: { id: true } } } }))?.targets.map(target => target.id) || [];
    const parsedLimits = targetLimits === undefined ? [] : parseTargetLimits(targetLimits, selectedTargetIds);
    if (parsedLimits === 'invalid') {
        return res.status(400).json({ error: 'targetLimits debe contener cantidades enteras entre 1 y 100 para los medios seleccionados' });
    }

    try {
        const workflow = await prisma.$transaction(async tx => {
            const data: any = {
                name,
                section: section || null,
                sources: Array.isArray(sources) ? sources : [],
                minScore: minScore ? parseInt(minScore) : null,
                targetCategory: targetCategory || null,
                cron,
                isActive
            };

            if (articleWindowHours !== undefined) {
                data.articleWindowHours = parsedWindow;
            }

            if (parsedDefaultLimit !== undefined) {
                data.defaultArticleLimit = parsedDefaultLimit;
            }

            if (typeof allowRepublish === 'boolean') {
                data.allowRepublish = allowRepublish;
            }

            if (targetIds) {
                data.targets = { set: targetIds.map((id: string) => ({ id })) };
            }

            const updated = await tx.workflow.update({
                where: { id: req.params.id },
                data,
                include: { targets: true }
            });

            if (targetLimits !== undefined) {
                await syncTargetLimits(updated.id, selectedTargetIds, targetLimits, tx);
            }

            return tx.workflow.findUnique({
                where: { id: updated.id },
                include: { targets: true, targetLimits: true }
            });
        });
        schedulerService.scheduleWorkflow(workflow);
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update workflow' });
    }
});

// DELETE /api/workflows/:id
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await prisma.workflow.delete({
            where: { id: req.params.id }
        });
        schedulerService.unscheduleWorkflow(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete workflow' });
    }
});

export default router;
