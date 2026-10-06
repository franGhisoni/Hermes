import { NextFunction, RequestHandler, Response, Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireAdmin } from '../middlewares/auth';

const router = Router();
const userId = (req: AuthRequest) => req.user!.id;
const safe = (handler: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next: NextFunction) => { Promise.resolve(handler(req as AuthRequest, res)).catch(error => {
        if (res.headersSent) return next(error);
        console.error('Feedback request failed:', error);
        res.status(500).json({ error: 'No se pudo procesar el reporte. Intentá nuevamente.' });
    }); };

router.post('/feedback', safe(async (req, res) => {
    const kind = req.body?.kind;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const articleUrl = kind === 'ERROR' && typeof req.body?.articleUrl === 'string' ? req.body.articleUrl.trim() : '';
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


export default router;
