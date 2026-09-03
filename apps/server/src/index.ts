import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { QueueService, SCRAPER_DEFINITIONS, ensureRegisteredScrapers } from './services/QueueService';
import { ArticleService, buildContentPreview } from './services/ArticleService';
import { BlockedPersonAction, EditorialRuleMatchType, ScrapeRunTrigger } from '@prisma/client';
import { prisma } from './lib/prisma';

const app = express();
const port = parseInt(process.env.PORT || '3000');
app.options('*', cors());
app.use(cors({
    origin: true, // Reflect request origin to support credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

import authRouter from './routes/AuthRouter';
import userRouter from './routes/UserRouter';
import sectionRouter from './routes/SectionRouter';
import filterCategoryRouter from './routes/FilterCategoryRouter';
import targetRouter from './routes/TargetRouter';
import { publishQueueService } from './services/PublishQueueService';
import { requireAuth, requireAdmin, requireReadOnly } from './middlewares/auth';

import { SchedulerService } from './services/SchedulerService';
import cron from 'node-cron';

const queueService = new QueueService();
const articleService = new ArticleService();
export const schedulerService = new SchedulerService(queueService, articleService);

async function initializeBackgroundServices() {
    try {
        await queueService.initializeWorkerConcurrency();
    } catch (error) {
        console.error('Failed to load persisted worker concurrency; keeping the environment default:', error);
    }
    try {
        await ensureRegisteredScrapers();
    } catch (error) {
        console.error('Failed to register scraper configuration:', error);
    }
    await schedulerService.initialize();
}

initializeBackgroundServices();

async function initSections() {
    try {
        const hasSections = await prisma.section.findFirst();
        if (!hasSections) {
            await prisma.section.createMany({
                data: [
                    { name: 'Portada', path: '/' },
                    { name: 'Último Momento', path: '/ultimo-momento' },
                    { name: 'Política', path: '/politica' },
                    { name: 'Economía', path: '/economia' },
                    { name: 'Sociedad', path: '/sociedad' },
                    { name: 'Deportes', path: '/deportes' },
                    { name: 'Internacional', path: '/internacional' }
                ]
            });
            console.log('Seeded default global sections.');
        }
    } catch (e) {
        console.error('Failed to init source sections:', e);
    }
}
initSections();

async function initDefaultTargets() {
    try {
        const existing = await prisma.target.findFirst({
            where: {
                OR: [
                    { type: 'VORKNEWS' },
                    { name: 'Política del Sur' }
                ]
            }
        });
        if (!existing) {
            await prisma.target.create({
                data: {
                    name: 'Política del Sur',
                    type: 'VORKNEWS',
                    config: {
                        publishMode: 'DRAFT',
                        defaultAuthor: 'Juan Bautista Vega',
                        defaultSectionId: '64'
                    }
                }
            });
            console.log('Seeded default Vorknews target: Política del Sur');
        }
    } catch (e) {
        console.error('Failed to init default targets:', e);
    }
}
initDefaultTargets();

// Open routes
app.use('/api/auth', authRouter);

// Public image serving (must be before auth guard — consumed by frontend and email clients)
app.get('/api/images/:id', async (req, res) => {
    try {
        const img = await prisma.generatedImage.findUnique({ where: { id: req.params.id } });
        if (!img) return res.status(404).end();
        res.setHeader('Content-Type', img.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=172800');
        res.send(Buffer.from(img.data));
    } catch (error) {
        console.error('Error serving generated image:', error);
        res.status(500).end();
    }
});

// Protected global routers
app.use('/api/users', userRouter);
app.use('/api/targets', targetRouter);

// Global auth guard for the rest of the API. Demo users may browse, but the
// read-only guard also protects against crafted mutation requests.
app.use('/api', requireAuth, requireReadOnly);

// GET /api/articles - List all articles
app.get('/api/articles', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const { source, section, category, status, search, sortBy, sortOrder } = req.query as Record<string, string>;

        const result = await articleService.getArticles({
            page,
            limit,
            source,
            section,
            category,
            status,
            search,
            sortBy: sortBy as 'date' | 'score',
            sortOrder: sortOrder as 'desc' | 'asc'
        });
        res.json(result);
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/articles/:id - Get single article
app.get('/api/articles/:id', async (req, res) => {
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Not found' });

        const editorial = (article.editorialData as any) || {};
        if (!editorial.seo) {
            editorial.seo = {
                title: article.rewrittenTitle || article.originalTitle,
                volanta: article.location ? article.location.toUpperCase() : (article.section ? article.section.toUpperCase() : 'POLÍTICA'),
                bajada: article.contentPreview || (article.originalContent ? article.originalContent.slice(0, 180) + '...' : ''),
                content: article.rewrittenContent || article.originalContent,
                tags: [article.section, article.location].filter(Boolean).join(', ')
            };
            article.editorialData = editorial;
        }

        res.json(article);
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Section router (has its own auth: requireAuth for GET, requireAdmin for POST/DELETE)
app.use('/api/config/sections', sectionRouter);
app.use('/api/config/filter-categories', filterCategoryRouter);

// Workflow router (must be imported after schedulerService is exported to avoid circular dep)
import workflowRouter from './routes/WorkflowRouter';
app.use('/api/workflows', workflowRouter);

// GET /api/config/scrapers - List every registered scraper and its toggle.
// This is intentionally separate from /sources, which only returns enabled
// sources for filters and workflows.
app.get('/api/config/scrapers', async (req, res) => {
    try {
        await ensureRegisteredScrapers();
        const sources = await prisma.source.findMany({
            where: { name: { in: SCRAPER_DEFINITIONS.map(definition => definition.source) } },
            select: { id: true, name: true, url: true, active: true },
            orderBy: { name: 'asc' }
        });
        const byName = new Map(sources.map(source => [source.name, source]));
        res.json(SCRAPER_DEFINITIONS.map(definition => {
            const source = byName.get(definition.source);
            return {
                id: source?.id ?? null,
                source: definition.source,
                label: definition.label,
                url: source?.url ?? null,
                active: source?.active ?? false
            };
        }));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scraper configuration' });
    }
});

// PUT /api/config/scrapers/:source - Enable or disable a registered scraper.
app.put('/api/config/scrapers/:source', requireAdmin, async (req, res) => {
    const definition = SCRAPER_DEFINITIONS.find(item => item.source === req.params.source);
    if (!definition) return res.status(404).json({ error: 'Unknown scraper' });
    if (typeof req.body?.active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' });
    }

    try {
        await ensureRegisteredScrapers();
        const source = await prisma.source.findFirst({ where: { name: definition.source } });
        if (!source) return res.status(404).json({ error: 'Scraper configuration not found' });
        const updated = await prisma.source.update({
            where: { id: source.id },
            data: { active: req.body.active }
        });
        res.json({
            id: updated.id,
            source: definition.source,
            label: definition.label,
            url: updated.url,
            active: updated.active
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update scraper configuration' });
    }
});

// GET /api/config/sources - List enabled sources for filters and workflows.
app.get('/api/config/sources', async (req, res) => {
    try {
        const sources = await prisma.source.findMany({
            where: { active: true },
            orderBy: { name: 'asc' }
        });
        res.json(sources);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sources' });
    }
});

// Scrape Schedule router
import scrapeScheduleRouter from './routes/ScrapeScheduleRouter';
app.use('/api/scrape-schedules', scrapeScheduleRouter);

// Notifications router (accessible to all authenticated users)
import notificationRouter from './routes/NotificationRouter';
app.use('/api/notifications', notificationRouter);

// Config API (admin-only for the remaining config endpoints)
app.use('/api/config', requireAdmin);

import { ConfigService } from './services/ConfigService';
import { buildEditorialData, EditorialService } from './services/EditorialService';
const configService = new ConfigService();
const editorialService = new EditorialService();

const EDITORIAL_MATCH_TYPES = ['GLOBAL', 'SECTION', 'SCORE_RANGE', 'LOCATION'] as const;
const BLOCKED_PERSON_ACTIONS = ['LOWER_SCORE', 'BLOCK_PUBLICATION'] as const;

function optionalScore(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : null;
}

function normalizeAliases(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value
        : typeof value === 'string' ? value.split(',') : [];
    return Array.from(new Set(values
        .map(item => String(item).trim())
        .filter(Boolean)));
}

// Editorial policy configuration. Rules are intentionally independent from
// prompts so section/score/location conditions can evolve without replacing
// the global rewrite prompt.
app.get('/api/config/editorial', async (_req, res) => {
    try {
        const [rules, blockedPeople] = await Promise.all([
            prisma.editorialRule.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
            prisma.blockedPerson.findMany({ orderBy: { name: 'asc' } })
        ]);
        res.json({ rules, blockedPeople });
    } catch (error) {
        console.error('Failed to fetch editorial configuration:', error);
        res.status(500).json({ error: 'No se pudo cargar la configuración editorial' });
    }
});

app.post('/api/config/editorial/rules', async (req, res) => {
    const body = req.body || {};
    const matchType = body.matchType as EditorialRuleMatchType;
    const minScore = optionalScore(body.minScore);
    const maxScore = optionalScore(body.maxScore);
    if (!body.name?.trim() || !body.styleInstruction?.trim()) {
        return res.status(400).json({ error: 'name y styleInstruction son obligatorios' });
    }
    if (!(EDITORIAL_MATCH_TYPES as readonly string[]).includes(matchType)) {
        return res.status(400).json({ error: 'matchType inválido' });
    }
    if (matchType === 'SECTION' && !body.section?.trim()) {
        return res.status(400).json({ error: 'section es obligatoria para una regla por sección' });
    }
    if (matchType === 'SCORE_RANGE' && minScore === null && maxScore === null) {
        return res.status(400).json({ error: 'Definí al menos un límite de score' });
    }
    if (matchType === 'LOCATION' && !body.location?.trim()) {
        return res.status(400).json({ error: 'location es obligatoria para una regla por ubicación' });
    }
    if (minScore !== null && maxScore !== null && minScore > maxScore) {
        return res.status(400).json({ error: 'minScore no puede ser mayor que maxScore' });
    }

    try {
        const rule = await prisma.editorialRule.create({
            data: {
                name: body.name.trim(),
                active: body.active !== false,
                priority: Number.isInteger(Number(body.priority)) ? Number(body.priority) : 0,
                matchType,
                section: body.section?.trim() || null,
                minScore,
                maxScore,
                location: body.location?.trim() || null,
                styleInstruction: body.styleInstruction.trim()
            }
        });
        res.status(201).json(rule);
    } catch (error) {
        console.error('Failed to create editorial rule:', error);
        res.status(500).json({ error: 'No se pudo crear la regla editorial' });
    }
});

app.put('/api/config/editorial/rules/:id', async (req, res) => {
    const current = await prisma.editorialRule.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Regla editorial no encontrada' });
    const body = req.body || {};
    const matchType = (body.matchType ?? current.matchType) as EditorialRuleMatchType;
    const minScore = optionalScore(body.minScore ?? current.minScore);
    const maxScore = optionalScore(body.maxScore ?? current.maxScore);
    if (!(EDITORIAL_MATCH_TYPES as readonly string[]).includes(matchType)) {
        return res.status(400).json({ error: 'matchType inválido' });
    }
    if (matchType === 'SECTION' && !(body.section ?? current.section)?.trim()) {
        return res.status(400).json({ error: 'section es obligatoria para una regla por sección' });
    }
    if (matchType === 'SCORE_RANGE' && minScore === null && maxScore === null) {
        return res.status(400).json({ error: 'Definí al menos un límite de score' });
    }
    if (matchType === 'LOCATION' && !(body.location ?? current.location)?.trim()) {
        return res.status(400).json({ error: 'location es obligatoria para una regla por ubicación' });
    }
    if (minScore !== null && maxScore !== null && minScore > maxScore) {
        return res.status(400).json({ error: 'minScore no puede ser mayor que maxScore' });
    }

    try {
        const rule = await prisma.editorialRule.update({
            where: { id: current.id },
            data: {
                name: typeof body.name === 'string' ? body.name.trim() : current.name,
                active: typeof body.active === 'boolean' ? body.active : current.active,
                priority: body.priority === undefined ? current.priority : Number(body.priority),
                matchType,
                section: (body.section ?? current.section)?.trim() || null,
                minScore,
                maxScore,
                location: (body.location ?? current.location)?.trim() || null,
                styleInstruction: typeof body.styleInstruction === 'string'
                    ? body.styleInstruction.trim()
                    : current.styleInstruction
            }
        });
        res.json(rule);
    } catch (error) {
        console.error('Failed to update editorial rule:', error);
        res.status(500).json({ error: 'No se pudo actualizar la regla editorial' });
    }
});

app.delete('/api/config/editorial/rules/:id', async (req, res) => {
    try {
        await prisma.editorialRule.delete({ where: { id: req.params.id } });
        res.json({ message: 'Regla editorial eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar la regla editorial' });
    }
});

app.post('/api/config/editorial/people', async (req, res) => {
    const body = req.body || {};
    const action = body.action as BlockedPersonAction;
    const scoreWhenMatched = body.scoreWhenMatched === undefined
        ? 2
        : optionalScore(body.scoreWhenMatched);
    if (!body.name?.trim()) return res.status(400).json({ error: 'name es obligatorio' });
    if (!(BLOCKED_PERSON_ACTIONS as readonly string[]).includes(action)) {
        return res.status(400).json({ error: 'action inválida' });
    }
    if (scoreWhenMatched === null) {
        return res.status(400).json({ error: 'scoreWhenMatched debe estar entre 1 y 10' });
    }

    try {
        const person = await prisma.blockedPerson.create({
            data: {
                name: body.name.trim(),
                aliases: normalizeAliases(body.aliases),
                action,
                scoreWhenMatched,
                active: body.active !== false
            }
        });
        res.status(201).json(person);
    } catch (error) {
        console.error('Failed to create blocked person:', error);
        res.status(500).json({ error: 'No se pudo crear la persona sensible' });
    }
});

app.put('/api/config/editorial/people/:id', async (req, res) => {
    const current = await prisma.blockedPerson.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Persona sensible no encontrada' });
    const body = req.body || {};
    const action = (body.action ?? current.action) as BlockedPersonAction;
    const scoreWhenMatched = body.scoreWhenMatched === undefined
        ? current.scoreWhenMatched
        : optionalScore(body.scoreWhenMatched);
    if (!(BLOCKED_PERSON_ACTIONS as readonly string[]).includes(action)) {
        return res.status(400).json({ error: 'action inválida' });
    }
    if (scoreWhenMatched === null) {
        return res.status(400).json({ error: 'scoreWhenMatched debe estar entre 1 y 10' });
    }

    try {
        const person = await prisma.blockedPerson.update({
            where: { id: current.id },
            data: {
                name: typeof body.name === 'string' ? body.name.trim() : current.name,
                aliases: body.aliases === undefined ? current.aliases : normalizeAliases(body.aliases),
                action,
                scoreWhenMatched,
                active: typeof body.active === 'boolean' ? body.active : current.active
            }
        });
        res.json(person);
    } catch (error) {
        console.error('Failed to update blocked person:', error);
        res.status(500).json({ error: 'No se pudo actualizar la persona sensible' });
    }
});

app.delete('/api/config/editorial/people/:id', async (req, res) => {
    try {
        await prisma.blockedPerson.delete({ where: { id: req.params.id } });
        res.json({ message: 'Persona sensible eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar la persona sensible' });
    }
});

// POST /api/scrape - Manual Trigger
// Body: { source, limit?, sectionId? }
// - With `sectionId`: queues a single job for that section (override applied).
// - Without `sectionId`: queues one job per enabled section, applying any
//   per-source overrides (path / scrapeLimit / enabled flag).
app.post('/api/scrape', async (req, res) => {
    const { source, limit, sectionId } = req.body;
    if (!source) {
        return res.status(400).json({ error: 'Missing source' });
    }

    try {
        const configuredSource = await prisma.source.findFirst({
            where: { name: source },
            select: { active: true }
        });
        if (!configuredSource?.active) {
            return res.status(400).json({ error: `El scraper "${source}" está deshabilitado o no existe.` });
        }

        let effectiveLimit = limit;
        if (!effectiveLimit) {
            effectiveLimit = await configService.getScrapeLimit();
        }

        // Single-section path
        if (sectionId) {
            const section = await prisma.section.findUnique({
                where: { id: sectionId },
                include: { overrides: { where: { source } } }
            });
            if (!section) return res.status(404).json({ error: 'Section not found' });

            const override = section.overrides[0];
            if (override && override.enabled === false) {
                return res.status(400).json({ error: 'Section is disabled for this source' });
            }
            const resolvedPath = override?.path ?? section.path;
            const resolvedLimit = override?.scrapeLimit ?? section.scrapeLimit ?? effectiveLimit;
            await queueService.addScrapeJob(source, resolvedPath, resolvedLimit, {
                sectionName: section.name,
                trigger: ScrapeRunTrigger.MANUAL
            });

            return res.json({
                message: `Scrape job started for ${section.name}`,
                source,
                section: section.name,
                jobs: 1,
                defaultLimit: effectiveLimit
            });
        }

        // All-sections path — apply per-source overrides
        const sections = await prisma.section.findMany({
            include: { overrides: { where: { source } } }
        });

        if (sections.length === 0) {
            await queueService.addScrapeJob(source, undefined, effectiveLimit, {
                trigger: ScrapeRunTrigger.MANUAL
            });
            return res.json({ message: 'Scrape job started (no sections configured)', source, jobs: 1 });
        }

        let queued = 0;
        for (const section of sections) {
            const override = section.overrides[0];
            if (override && override.enabled === false) continue;
            const resolvedPath = override?.path ?? section.path;
            const resolvedLimit = override?.scrapeLimit ?? section.scrapeLimit ?? effectiveLimit;
            await queueService.addScrapeJob(source, resolvedPath, resolvedLimit, {
                sectionName: section.name,
                trigger: ScrapeRunTrigger.MANUAL
            });
            queued++;
        }

        res.json({
            message: `Scrape jobs started for ${queued} sections`,
            source,
            jobs: queued,
            defaultLimit: effectiveLimit
        });
    } catch (error) {
        console.error('Error starting scrape:', error);
        res.status(500).json({ error: 'Failed to start job' });
    }
});

// GET /api/scrape-runs - Admin audit log for scraper executions
app.get('/api/scrape-runs', requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
        const { source, section } = req.query as Record<string, string | undefined>;

        const runs = await prisma.scrapeRun.findMany({
            where: {
                ...(source ? { source } : {}),
                ...(section ? { sectionName: section } : {})
            },
            orderBy: { startedAt: 'desc' },
            take: limit
        });

        res.json(runs);
    } catch (error) {
        console.error('Error fetching scrape runs:', error);
        res.status(500).json({ error: 'Failed to fetch scrape runs' });
    }
});

// POST /api/scrape-runs/:id/cancel - Cancel a queued run or request cancellation
// for an active one. Active scraper jobs stop cooperatively before processing
// articles once the scraper returns control.
app.post('/api/scrape-runs/:id/cancel', requireAdmin, async (req, res) => {
    try {
        const run = await queueService.cancelScrapeRun(req.params.id);
        res.json(run);
    } catch (error: any) {
        if (error?.message === 'Scrape run not found') {
            return res.status(404).json({ error: 'Scrape run not found' });
        }
        console.error('Error cancelling scrape run:', error);
        res.status(500).json({ error: 'Failed to cancel scrape run' });
    }
});

// Map between the camelCase API surface and the underlying setting keys. The
// keys belong to ConfigService (snake_case in the DB); the API contracts use
// camelCase for the UI.
type SettingDef =
    | { api: string; key: string; kind: 'int'; min?: number; max?: number }
    | { api: string; key: string; kind: 'float'; min?: number; max?: number }
    | { api: string; key: string; kind: 'boolean' }
    | { api: string; key: string; kind: 'string'; validate?: (v: string) => string | null }
    | { api: string; key: string; kind: 'cron' };

const REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

const validateReasoningEffort = (value: string): string | null =>
    REASONING_EFFORTS.has(value)
        ? null
        : 'El nivel de razonamiento debe ser none, low, medium, high, xhigh o max';

const SETTINGS: SettingDef[] = [
    { api: 'scrapeLimit', key: 'scrape_limit', kind: 'int', min: 1 },
    { api: 'scrapeOnlyToday', key: 'scrape_only_today', kind: 'boolean' },
    { api: 'scraperWorkerConcurrency', key: 'scraper_worker_concurrency', kind: 'int', min: 1, max: 8 },
    { api: 'articleRetentionHours', key: 'article_retention_hours', kind: 'int', min: 1 },
    { api: 'articleCleanupCron', key: 'article_cleanup_cron', kind: 'cron' },
    { api: 'imageMinScore', key: 'image_min_score', kind: 'int', min: 1, max: 10 },
    { api: 'imagePoolSize', key: 'image_pool_size', kind: 'int', min: 1, max: 100 },
    { api: 'imageScoringMaxRetries', key: 'image_scoring_max_retries', kind: 'int', min: 0, max: 20 },
    { api: 'imagePerQueryCap', key: 'image_per_query_cap', kind: 'int', min: 1, max: 20 },
    { api: 'imageMinWidth', key: 'image_min_width', kind: 'int', min: 1 },
    { api: 'imageMinHeight', key: 'image_min_height', kind: 'int', min: 1 },
    { api: 'imageQueryContentChars', key: 'image_query_content_chars', kind: 'int', min: 1 },
    { api: 'imageQueryMinLength', key: 'image_query_min_length', kind: 'int', min: 1 },
    { api: 'imageQueryMaxCount', key: 'image_query_max_count', kind: 'int', min: 1, max: 50 },
    { api: 'imageLeadMinChars', key: 'image_lead_min_chars', kind: 'int', min: 1 },
    { api: 'imageLeadMaxChars', key: 'image_lead_max_chars', kind: 'int', min: 1 },
    { api: 'imageLeadMaxWords', key: 'image_lead_max_words', kind: 'int', min: 1 },
    { api: 'imageFetchTimeoutMs', key: 'image_fetch_timeout_ms', kind: 'int', min: 100 },
    { api: 'modelEmbedding', key: 'model_embedding', kind: 'string' },
    { api: 'modelRewrite', key: 'model_rewrite', kind: 'string' },
    { api: 'modelInterest', key: 'model_interest', kind: 'string' },
    { api: 'modelImageQuery', key: 'model_image_query', kind: 'string' },
    { api: 'modelImageScoring', key: 'model_image_scoring', kind: 'string' },
    { api: 'modelImageGeneration', key: 'model_image_generation', kind: 'string' },
    { api: 'aiImageScoringReasoningEffort', key: 'ai_image_scoring_reasoning_effort', kind: 'string', validate: validateReasoningEffort },
    { api: 'aiRewriteMaxTokens', key: 'ai_rewrite_max_tokens', kind: 'int', min: 1 },
    { api: 'aiRewriteContentChars', key: 'ai_rewrite_content_chars', kind: 'int', min: 1 },
    { api: 'aiInterestMaxTokens', key: 'ai_interest_max_tokens', kind: 'int', min: 1 },
    { api: 'aiInterestContentChars', key: 'ai_interest_content_chars', kind: 'int', min: 1 },
    { api: 'aiImageQueryMaxTokens', key: 'ai_image_query_max_tokens', kind: 'int', min: 1 },
    { api: 'aiImageQueryContentChars', key: 'ai_image_query_content_chars', kind: 'int', min: 1 },
    { api: 'aiImageScoringMaxTokens', key: 'ai_image_scoring_max_tokens', kind: 'int', min: 1 },
    { api: 'aiImageScoringContentChars', key: 'ai_image_scoring_content_chars', kind: 'int', min: 1 },
    { api: 'dedupThreshold', key: 'dedup_threshold', kind: 'float', min: 0, max: 1 },
    { api: 'embeddingTextChars', key: 'embedding_text_chars', kind: 'int', min: 1 },
    { api: 'workflowDefaultWindowHours', key: 'workflow_default_window_hours', kind: 'int', min: 1 }
];

app.get('/api/config/settings', async (req, res) => {
    const result: Record<string, any> = {};
    const settings = await configService.getSettingsSnapshot();
    for (const def of SETTINGS) {
        const raw = settings[def.key];
        if (def.kind === 'int') {
            result[def.api] = parseInt(raw, 10);
        } else if (def.kind === 'float') {
            result[def.api] = parseFloat(raw);
        } else if (def.kind === 'boolean') {
            result[def.api] = raw.trim().toLowerCase() === 'true';
        } else {
            result[def.api] = raw;
        }
    }
    res.json(result);
});

app.post('/api/config/settings', async (req, res) => {
    const body = req.body || {};
    let articleCleanupChanged = false;

    for (const def of SETTINGS) {
        const incoming = body[def.api];
        if (incoming === undefined || incoming === null) continue;

        if (def.kind === 'cron') {
            const value = incoming.toString().trim();
            if (!cron.validate(value)) {
                return res.status(400).json({ error: `Invalid ${def.api}` });
            }
            await configService.setSetting(def.key, value);
            if (def.api === 'articleCleanupCron') articleCleanupChanged = true;
            continue;
        }

        if (def.kind === 'string') {
            const value = incoming.toString().trim();
            if (def.validate) {
                const err = def.validate(value);
                if (err) return res.status(400).json({ error: err });
            }
            if (value.length === 0) {
                return res.status(400).json({ error: `${def.api} cannot be empty` });
            }
            await configService.setSetting(def.key, value);
            continue;
        }

        if (def.kind === 'boolean') {
            if (incoming !== true && incoming !== false && incoming !== 'true' && incoming !== 'false') {
                return res.status(400).json({ error: `${def.api} must be a boolean` });
            }
            await configService.setSetting(def.key, incoming === true || incoming === 'true' ? 'true' : 'false');
            continue;
        }

        if (def.kind === 'int') {
            const parsed = parseInt(incoming.toString(), 10);
            if (!Number.isFinite(parsed)) {
                return res.status(400).json({ error: `${def.api} must be an integer` });
            }
            const min = def.min ?? 1;
            if (parsed < min) {
                return res.status(400).json({ error: `${def.api} must be >= ${min}` });
            }
            if (def.max != null && parsed > def.max) {
                return res.status(400).json({ error: `${def.api} must be <= ${def.max}` });
            }
            await configService.setSetting(def.key, parsed.toString());
            if (def.api === 'scraperWorkerConcurrency') {
                queueService.setWorkerConcurrency(parsed);
            }
            continue;
        }

        if (def.kind === 'float') {
            const parsed = parseFloat(incoming.toString());
            if (!Number.isFinite(parsed)) {
                return res.status(400).json({ error: `${def.api} must be a number` });
            }
            const min = def.min ?? 0;
            if (parsed < min) {
                return res.status(400).json({ error: `${def.api} must be >= ${min}` });
            }
            if (def.max != null && parsed > def.max) {
                return res.status(400).json({ error: `${def.api} must be <= ${def.max}` });
            }
            await configService.setSetting(def.key, parsed.toString());
            continue;
        }
    }

    if (articleCleanupChanged) {
        await schedulerService.scheduleArticleCleanup();
    }

    res.json({ success: true });
});

// Config API
import { PromptService } from './services/PromptService';
const promptService = new PromptService();

// Init defaults on boot
promptService.ensureDefaultPrompts().then(() => console.log('Prompts initialized'));

app.get('/api/config/prompts', async (req, res) => {
    const prompts = await promptService.getPrompts();
    res.json(prompts);
});

app.put('/api/config/prompts/:id', async (req, res) => {
    try {
        const { template } = req.body;
        const updated = await promptService.updatePrompt(req.params.id, template);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update prompt' });
    }
});

// POST /api/articles/:id/publish - Publish article to a target (send email or publish to Vorknews)
import { MailService } from './services/MailService';
import { AIService } from './services/AIService';
import { VorknewsPublishService } from './services/VorknewsPublishService';
const mailService = new MailService();
const aiService = new AIService();
const vorknewsPublishService = new VorknewsPublishService();

// GET /api/vorknews/sections - List Vorknews sections
app.get('/api/vorknews/sections', (req, res) => {
    res.json(vorknewsPublishService.getSections());
});

// GET /api/config/vorknews - Get Vorknews settings
app.get('/api/config/vorknews', async (req, res) => {
    try {
        const mode = await configService.getVorknewsPublishMode();
        const author = await configService.getVorknewsDefaultAuthor();
        const sectionId = await configService.getVorknewsDefaultSectionId();
        res.json({ mode, author, sectionId });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to get Vorknews settings' });
    }
});

// PUT /api/config/vorknews - Update Vorknews settings
app.put('/api/config/vorknews', async (req, res) => {
    try {
        const { mode, author, sectionId } = req.body;
        if (mode) await configService.setSetting('vorknews_publish_mode', mode);
        if (author !== undefined) await configService.setSetting('vorknews_default_author', author);
        if (sectionId) await configService.setSetting('vorknews_default_section_id', sectionId);
        res.json({ success: true, mode, author, sectionId });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to update Vorknews settings' });
    }
});

// POST /api/articles/:id/rewrite-vorknews - Generate SEO-optimized Vorknews rewrite
app.post('/api/articles/:id/rewrite-vorknews', async (req, res) => {
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        const instructions = req.body?.instructions || req.body?.comments;
        const rewritten = await aiService.rewriteForVorknews(article.originalTitle, article.originalContent, 'neutral', instructions);
        const existingData = (article.editorialData as any) || {};
        const updated = await prisma.article.update({
            where: { id: article.id },
            data: {
                editorialData: {
                    ...existingData,
                    seo: rewritten
                }
            }
        });
        res.json({ ...rewritten, editorialData: updated.editorialData });
    } catch (error: any) {
        console.error('Error generating Vorknews rewrite:', error);
        res.status(500).json({ error: 'Failed to generate Vorknews rewrite' });
    }
});

// POST /api/articles/:id/generate-social - Generate social media copy
app.post('/api/articles/:id/generate-social', async (req, res) => {
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        const social = await aiService.generateSocialCopy(article.originalTitle, article.originalContent);
        const existingData = (article.editorialData as any) || {};
        const updated = await prisma.article.update({
            where: { id: article.id },
            data: {
                editorialData: {
                    ...existingData,
                    social
                }
            }
        });
        res.json({ ...social, editorialData: updated.editorialData });
    } catch (error: any) {
        console.error('Error generating social copy:', error);
        res.status(500).json({ error: 'Failed to generate social copy' });
    }
});

app.post('/api/articles/:id/publish', async (req, res) => {
    const {
        targetId,
        category,
        rewrittenTitle,
        rewrittenContent,
        vorknewsMode,
        vorknewsSectionId,
        vorknewsAuthor,
        vorknewsTitle,
        vorknewsContentHtml,
        vorknewsVolanta,
        vorknewsBajada,
        vorknewsTags
    } = req.body;

    try {
        const draftUpdates: { rewrittenTitle?: string; rewrittenContent?: string; contentPreview?: string } = {};
        if (typeof rewrittenTitle === 'string') draftUpdates.rewrittenTitle = rewrittenTitle;
        if (typeof rewrittenContent === 'string') draftUpdates.rewrittenContent = rewrittenContent;

        let article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        if (Object.keys(draftUpdates).length > 0) {
            if (draftUpdates.rewrittenContent !== undefined) {
                draftUpdates.contentPreview = buildContentPreview(draftUpdates.rewrittenContent || article.originalContent);
            }
            article = await prisma.article.update({
                where: { id: req.params.id },
                data: draftUpdates,
                include: { source: true }
            });
        }

        const editorial = await editorialService.evaluate({
            title: article.originalTitle,
            content: article.originalContent,
            section: article.section,
            location: article.location,
            score: article.interestScore ?? 5
        });
        if (article.publicationBlocked || editorial.publicationBlocked) {
            if (!article.publicationBlocked || !editorial.publicationBlocked) {
                await prisma.article.update({
                    where: { id: article.id },
                    data: {
                        status: 'REJECTED',
                        publicationBlocked: true,
                        publicationBlockReason: editorial.publicationBlockReason || article.publicationBlockReason
                    }
                });
            }
            return res.status(409).json({
                error: article.publicationBlockReason || editorial.publicationBlockReason || 'La nota está bloqueada para publicación.'
            });
        }

        let target: any = null;
        if (targetId && targetId !== 'VORKNEWS' && targetId !== 'vorknews') {
            target = await prisma.target.findUnique({ where: { id: targetId } });
        }
        if (!target) {
            target = await prisma.target.findFirst({
                where: {
                    OR: [
                        { type: 'VORKNEWS' },
                        { name: 'Política del Sur' }
                    ]
                }
            });
        }
        if (!target) return res.status(404).json({ error: 'Target not found' });

        console.log(`[MANUAL-PUBLISH] Publishing article to target: ${target.name} (${target.type})`);

        const articleForTarget = {
            ...article,
            rewrittenTitle: article.rewrittenTitle || article.originalTitle,
            rewrittenContent: article.rewrittenContent || article.originalContent
        };

        if (target.type === 'VORKNEWS') {
            const targetConfig = (target.config as any) || {};
            const articleEditorial = (article.editorialData as any) || {};
            const savedSeo = articleEditorial.seo || {};

            let finalTitle = vorknewsTitle || savedSeo.title;
            let finalContentHtml = vorknewsContentHtml || savedSeo.content;
            let finalVolanta = vorknewsVolanta !== undefined ? vorknewsVolanta : (savedSeo.volanta || '');
            let finalBajada = vorknewsBajada !== undefined ? vorknewsBajada : (savedSeo.bajada || '');
            let finalTags = vorknewsTags !== undefined ? vorknewsTags : (savedSeo.tags || '');

            // ALWAYS publish with SEO format: if not generated yet, generate it on the fly!
            if (!finalContentHtml || !finalTitle) {
                console.log(`[MANUAL-PUBLISH] Generating SEO version on-the-fly for Vorknews publication...`);
                const generated = await aiService.rewriteForVorknews(article.originalTitle, article.originalContent);
                finalTitle = finalTitle || generated.title;
                finalContentHtml = finalContentHtml || generated.content;
                finalVolanta = finalVolanta || generated.volanta;
                finalBajada = finalBajada || generated.bajada;
                finalTags = finalTags || generated.tags;
            }

            // Immediately persist editor's latest SEO content and mark publishing in progress
            const updatedArticle = await prisma.article.update({
                where: { id: req.params.id },
                data: {
                    rewrittenTitle: finalTitle,
                    rewrittenContent: finalContentHtml,
                    contentPreview: buildContentPreview(finalBajada || finalContentHtml),
                    editorialData: {
                        ...articleEditorial,
                        publishing: true,
                        publishError: null,
                        seo: {
                            title: finalTitle,
                            content: finalContentHtml,
                            volanta: finalVolanta,
                            bajada: finalBajada,
                            tags: finalTags
                        }
                    }
                },
                include: { source: true }
            });

            // Enqueue non-blocking background publication
            await publishQueueService.enqueue({
                articleId: article.id,
                targetId: target.id,
                mode: vorknewsMode || targetConfig.publishMode || 'DRAFT',
                sectionId: vorknewsSectionId || targetConfig.defaultSectionId || (category ? vorknewsPublishService.resolveSectionId(category) : undefined),
                author: vorknewsAuthor || targetConfig.defaultAuthor || 'Juan Bautista Vega',
                volanta: finalVolanta,
                bajada: finalBajada,
                tags: finalTags,
                title: finalTitle,
                contentHtml: finalContentHtml,
                category
            });

            return res.json({
                success: true,
                queued: true,
                message: `La nota se envió a la cola de publicación para Política del Sur. Podés continuar trabajando; recibirás una notificación al completarse.`,
                article: updatedArticle
            });
        }

        // Standard Email (Postie / WordPress)
        if (!target.email) {
            return res.status(400).json({ error: 'Target has no email address configured' });
        }

        const articleCategory = category || article.section || undefined;

        // Persist and enqueue email dispatch
        const updatedArticle = await prisma.article.update({
            where: { id: req.params.id },
            data: {
                editorialData: {
                    ...((article.editorialData as any) || {}),
                    publishing: true,
                    publishError: null
                }
            },
            include: { source: true }
        });

        await publishQueueService.enqueue({
            articleId: article.id,
            targetId: target.id,
            category: articleCategory
        });

        res.json({
            success: true,
            queued: true,
            message: `La nota se está despachando por email a ${target.name} en segundo plano.`,
            article: updatedArticle
        });
    } catch (error: any) {
        console.error('Error publishing article:', error);
        res.status(500).json({ error: error.message || 'Failed to publish article' });
    }
});

// DELETE /api/articles/:id - Delete article
app.delete('/api/articles/:id', async (req, res) => {
    try {
        await articleService.deleteArticle(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

// PUT /api/articles/:id - Update article
app.put('/api/articles/:id', async (req, res) => {
    try {
        const { rewrittenTitle, rewrittenContent, editorialData } = req.body;
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        
        const updateData: any = {};
        if (typeof rewrittenTitle === 'string') updateData.rewrittenTitle = rewrittenTitle;
        if (typeof rewrittenContent === 'string') {
            updateData.rewrittenContent = rewrittenContent;
            updateData.contentPreview = buildContentPreview(rewrittenContent || article.originalContent);
        }
        if (editorialData !== undefined) {
            updateData.editorialData = editorialData;
        }

        const updated = await prisma.article.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update article' });
    }
});

// POST /api/articles/:id/rewrite - Rewrite article
app.post('/api/articles/:id/rewrite', async (req, res) => {
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Not found' });

        const aiService = new AIService();
        const editorial = await editorialService.evaluate({
            title: article.originalTitle,
            content: article.originalContent,
            section: article.section,
            location: article.location,
            score: article.interestScore ?? 5
        });
        const instructions = req.body?.instructions || req.body?.comments;
        const result = await aiService.rewriteForVorknews(article.originalTitle, article.originalContent, editorial.style, instructions);

        const existingData = (article.editorialData as any) || {};
        const updatedEditorial = {
            ...existingData,
            ...buildEditorialData(editorial),
            seo: result
        };

        const updated = await prisma.article.update({
            where: { id: article.id },
            data: {
                rewrittenTitle: result.title,
                rewrittenContent: result.content,
                contentPreview: buildContentPreview(result.bajada || result.content),
                interestScore: editorial.effectiveScore,
                editorialData: updatedEditorial,
                publicationBlocked: editorial.publicationBlocked,
                publicationBlockReason: editorial.publicationBlockReason,
                status: editorial.publicationBlocked ? 'REJECTED' : article.status
            }
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Rewrite failed' });
    }
});

// POST /api/articles/:id/regenerate-image
import { ImageService } from './services/ImageService';
app.post('/api/articles/:id/regenerate-image', async (req, res) => {
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Not found' });

        const imageService = new ImageService();
        // Use rewritten title for better context, or original
        const prompt = article.rewrittenTitle || article.originalTitle;
        const newImage = await imageService.generateImage(prompt);

        if (newImage) {
            // Add to candidates list (append)
            const currentCandidates = (article as any).imageCandidates || [];
            const updatedCandidates = [...currentCandidates, newImage];

            // Update DB
            await prisma.article.update({
                where: { id: article.id },
                data: {
                    imageCandidates: updatedCandidates,
                    featureImageUrl: newImage // Auto-select the new one
                }
            });

            res.json({ url: newImage, candidates: updatedCandidates });
        } else {
            res.status(500).json({ error: 'La generación de imagen falló (ver logs del servidor: OpenAI images).' });
        }
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: `Error interno: ${error?.message || 'desconocido'}` });
    }
});

// PUT /api/articles/:id/select-image
// Also accepts manually entered URLs — adds them to imageCandidates if not already present
app.put('/api/articles/:id/select-image', async (req, res) => {
    const { imageUrl } = req.body;
    const isValidUrl = typeof imageUrl === 'string' && (imageUrl.startsWith('http') || imageUrl.startsWith('/api/images/'));
    if (!imageUrl || !isValidUrl) {
        return res.status(400).json({ error: 'Invalid imageUrl' });
    }
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        const currentCandidates: string[] = (article as any).imageCandidates || [];
        const currentScores: Record<string, number> = ((article as any).imageScores as Record<string, number>) || {};

        const isNewUrl = !currentCandidates.includes(imageUrl);
        const updatedCandidates = isNewUrl ? [...currentCandidates, imageUrl] : currentCandidates;
        const updatedScores = isNewUrl ? { ...currentScores, [imageUrl]: 5 } : currentScores;

        await prisma.article.update({
            where: { id: req.params.id },
            data: {
                featureImageUrl: imageUrl,
                imageCandidates: updatedCandidates,
                imageScores: updatedScores
            }
        });

        res.json({ success: true, featureImageUrl: imageUrl, candidates: updatedCandidates, imageScores: updatedScores });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update' });
    }
});

// POST /api/articles/:id/search-images
app.post('/api/articles/:id/search-images', async (req, res) => {
    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Not found' });

        const imageService = new ImageService();

        // Same smart-query pass the automatic pipeline uses — the manual button
        // used to run with regex-only queries, making it strictly worse exactly
        // when the editor asks for help.
        const smartQueryResult = await aiService.generateImageSearchQueries({
            title: article.originalTitle,
            content: article.originalContent,
            rewrittenTitle: article.rewrittenTitle || undefined,
            originalImageUrl: article.originalImageUrl || undefined
        });

        const { images } = await imageService.searchImages({
            title: article.originalTitle,
            content: article.originalContent,
            rewrittenTitle: article.rewrittenTitle || undefined,
            smartQueries: smartQueryResult.queries
        });

        const currentCandidates: string[] = (article as any).imageCandidates || [];
        const newCandidates = images.filter(img => !currentCandidates.includes(img));
        const updatedCandidates = [...currentCandidates, ...newCandidates];

        // Score the fresh candidates so they don't show up unranked in the carousel.
        const currentScores: Record<string, number> = ((article as any).imageScores as Record<string, number>) || {};
        let updatedScores = currentScores;
        if (newCandidates.length > 0) {
            const imageMinScore = await configService.getImageMinScore();
            const scored = await aiService.selectBestImage(
                article.originalTitle,
                article.originalContent,
                newCandidates,
                article.originalImageUrl || undefined,
                imageMinScore
            );
            updatedScores = { ...currentScores };
            newCandidates.forEach((url, i) => {
                updatedScores[url] = scored.scores[i] ?? 0;
            });
        }

        await prisma.article.update({
            where: { id: article.id },
            data: { imageCandidates: updatedCandidates, imageScores: updatedScores }
        });

        res.json({ candidates: updatedCandidates, imageScores: updatedScores });

    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: `Search failed: ${error?.message || 'unknown error'}` });
    }
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

server.on('error', (err) => {
    console.error('Server failed to start:', err);
});
