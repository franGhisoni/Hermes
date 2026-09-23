import { NextFunction, RequestHandler, Response, Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireAdmin } from '../middlewares/auth';
import { getSavedDraft, parseEditorDraft, suggestRewritePreference } from '../services/LearningService';

const router = Router();
const userId = (req: AuthRequest) => req.user!.id;
const safe = (handler: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next: NextFunction) => { Promise.resolve(handler(req as AuthRequest, res)).catch(next); };

router.post('/feedback', safe(async (req, res) => {
    const kind = req.body?.kind;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const articleUrl = typeof req.body?.articleUrl === 'string' ? req.body.articleUrl.trim() : '';
    if (!['ERROR', 'SUGGESTION'].includes(kind) || !message || message.length > 2000 || articleUrl.length > 1000) {
        return res.status(400).json({ error: 'Completá un tipo y una descripción de hasta 2000 caracteres.' });
    }
    if (kind === 'ERROR' && !articleUrl) return res.status(400).json({ error: 'Agregá el enlace de la nota.' });
    if (articleUrl && !/^https?:\/\//i.test(articleUrl)) return res.status(400).json({ error: 'El enlace debe empezar con http o https.' });
    const report = await prisma.feedbackReport.create({ data: { userId: userId(req), kind, message, articleUrl: articleUrl || null } });
    res.status(201).json(report);
}));

router.get('/feedback', requireAdmin, safe(async (_req, res) => {
    const reports = await prisma.feedbackReport.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true } } }
    });
    res.json(reports);
}));

router.patch('/feedback/:id', requireAdmin, safe(async (req, res) => {
    if (!['OPEN', 'RESOLVED'].includes(req.body?.status)) return res.status(400).json({ error: 'Estado inválido.' });
    const result = await prisma.feedbackReport.updateMany({ where: { id: req.params.id }, data: { status: req.body.status } });
    if (!result.count) return res.status(404).json({ error: 'Reporte no encontrado.' });
    res.json({ success: true });
}));

router.get('/rewrite-preferences', safe(async (req, res) => {
    const preferences = await prisma.rewritePreference.findMany({ where: { userId: userId(req) }, orderBy: { createdAt: 'desc' } });
    res.json(preferences);
}));

router.get('/rewrite-preferences/all', requireAdmin, safe(async (_req, res) => {
    const preferences = await prisma.rewritePreference.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true } } }
    });
    res.json(preferences);
}));

router.patch('/rewrite-preferences/:id', safe(async (req, res) => {
    const existing = await prisma.rewritePreference.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Ajuste no encontrado.' });
    if (existing.userId !== userId(req) && req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Sin permiso.' });
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : undefined;
    if (instruction !== undefined && (!instruction || instruction.length > 350)) return res.status(400).json({ error: 'La indicación debe tener hasta 350 caracteres.' });
    if (req.body?.active !== undefined && typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Estado inválido.' });
    const updated = await prisma.rewritePreference.update({
        where: { id: existing.id },
        data: { instruction, active: req.body?.active }
    });
    res.json(updated);
}));

router.post('/articles/:id/learn/analyze', safe(async (req, res) => {
    const before = parseEditorDraft(req.body?.before);
    const after = parseEditorDraft(req.body?.after);
    if (!before || !after) return res.status(400).json({ error: 'Faltan las versiones de la nota antes y después de editarla.' });
    if (JSON.stringify(before) === JSON.stringify(after)) return res.status(409).json({ error: 'Todavía no hay cambios para aprender.' });
    const article = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) return res.status(404).json({ error: 'Nota no encontrada.' });
    if (JSON.stringify(after) !== JSON.stringify(getSavedDraft(article))) return res.status(409).json({ error: 'La nota cambió mientras se analizaba. Guardá y probá nuevamente.' });
    try {
        const instruction = await suggestRewritePreference(before, after);
        res.json({ instruction });
    } catch (error) {
        console.error('Could not analyze editor changes:', error);
        res.status(502).json({ error: 'No se pudo analizar la edición. Intentá nuevamente.' });
    }
}));

router.post('/articles/:id/learn/confirm', safe(async (req, res) => {
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : '';
    if (!instruction || instruction.length > 350) return res.status(400).json({ error: 'Escribí una indicación de hasta 350 caracteres.' });
    const before = parseEditorDraft(req.body?.before);
    const after = parseEditorDraft(req.body?.after);
    if (!before || !after) return res.status(400).json({ error: 'Faltan las versiones de la nota antes y después de editarla.' });
    if (JSON.stringify(before) === JSON.stringify(after)) return res.status(409).json({ error: 'No hay cambios para aprender.' });
    const article = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!article) return res.status(404).json({ error: 'Nota no encontrada.' });
    if (JSON.stringify(after) !== JSON.stringify(getSavedDraft(article))) return res.status(409).json({ error: 'La nota cambió después del análisis. Volvé a analizar tus cambios.' });
    const existing = await prisma.rewritePreference.findFirst({ where: { userId: userId(req), instruction: { equals: instruction, mode: 'insensitive' } } });
    if (existing) return res.status(409).json({ error: 'Ya guardaste esa indicación.' });
    const preference = await prisma.rewritePreference.create({ data: { userId: userId(req), articleId: article.id, instruction } });
    res.status(201).json(preference);
}));

export default router;
