import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { QueueService } from './services/QueueService';
import { ArticleService } from './services/ArticleService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
import targetRouter from './routes/TargetRouter';
import { requireAuth, requireAdmin } from './middlewares/auth';

import { SchedulerService } from './services/SchedulerService';
import cron from 'node-cron';

const queueService = new QueueService();
const articleService = new ArticleService();
export const schedulerService = new SchedulerService(queueService, articleService);

schedulerService.initialize();

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

// Global auth guard for the rest of the API
app.use('/api', requireAuth);

// GET /api/articles - List all articles
app.get('/api/articles', async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const { source, section, status, sortBy, sortOrder } = req.query as Record<string, string>;

        const result = await articleService.getArticles({
            page,
            limit,
            source,
            section,
            status,
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
        res.json(article);
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Section router (has its own auth: requireAuth for GET, requireAdmin for POST/DELETE)
app.use('/api/config/sections', sectionRouter);

// Workflow router (must be imported after schedulerService is exported to avoid circular dep)
import workflowRouter from './routes/WorkflowRouter';
app.use('/api/workflows', workflowRouter);

// GET /api/config/sources - List available sources for Workflows
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
const configService = new ConfigService();

// POST /api/scrape - Manual Trigger (scrapes ALL configured sections for a source)
app.post('/api/scrape', async (req, res) => {
    const { source, limit } = req.body;
    if (!source) {
        return res.status(400).json({ error: 'Missing source' });
    }

    try {
        // Use provided limit, or fetch from DB, or default to 3
        let effectiveLimit = limit;
        if (!effectiveLimit) {
            effectiveLimit = await configService.getScrapeLimit();
        }

        // Fetch all configured global sections
        const sections = await prisma.section.findMany();

        if (sections.length === 0) {
            // Fallback: scrape just the base URL if no sections configured
            await queueService.addScrapeJob(source, undefined, effectiveLimit);
            return res.json({ message: 'Scrape job started (no sections configured)', source, jobs: 1 });
        }

        // Queue a scrape job for each section, honoring its per-section limit
        // override when set; fall back to the workflow-wide effectiveLimit.
        for (const section of sections) {
            const sectionLimit = section.scrapeLimit ?? effectiveLimit;
            await queueService.addScrapeJob(source, section.path, sectionLimit);
        }

        res.json({ message: `Scrape jobs started for ${sections.length} sections`, source, jobs: sections.length, defaultLimit: effectiveLimit });
    } catch (error) {
        console.error('Error starting scrape:', error);
        res.status(500).json({ error: 'Failed to start job' });
    }
});

// Map between the camelCase API surface and the underlying setting keys. The
// keys belong to ConfigService (snake_case in the DB); the API contracts use
// camelCase for the UI.
type SettingDef =
    | { api: string; key: string; kind: 'int'; min?: number; max?: number }
    | { api: string; key: string; kind: 'float'; min?: number; max?: number }
    | { api: string; key: string; kind: 'string'; validate?: (v: string) => string | null }
    | { api: string; key: string; kind: 'cron' };

const SETTINGS: SettingDef[] = [
    { api: 'scrapeLimit', key: 'scrape_limit', kind: 'int', min: 1 },
    { api: 'articleRetentionHours', key: 'article_retention_hours', kind: 'int', min: 1 },
    { api: 'articleCleanupCron', key: 'article_cleanup_cron', kind: 'cron' },
    {
        api: 'imageSearchQueryTemplate', key: 'image_search_query_template', kind: 'string',
        validate: (v) => v.includes('{{query}}') ? null : 'imageSearchQueryTemplate must contain {{query}}'
    },
    {
        api: 'imageSearchUrlTemplate', key: 'image_search_url_template', kind: 'string',
        validate: (v) => (v.startsWith('http') && (v.includes('{{q}}') || v.includes('{{query}}')))
            ? null : 'imageSearchUrlTemplate must be a URL containing {{q}} or {{query}}'
    },
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
    { api: 'imageSearchPageTimeoutMs', key: 'image_search_page_timeout_ms', kind: 'int', min: 1000 },
    { api: 'imageSearchSelectorTimeoutMs', key: 'image_search_selector_timeout_ms', kind: 'int', min: 100 },
    { api: 'imageFetchTimeoutMs', key: 'image_fetch_timeout_ms', kind: 'int', min: 100 },
    { api: 'imageEngineFailureThreshold', key: 'image_engine_failure_threshold', kind: 'int', min: 1, max: 20 },
    { api: 'modelEmbedding', key: 'model_embedding', kind: 'string' },
    { api: 'modelRewrite', key: 'model_rewrite', kind: 'string' },
    { api: 'modelInterest', key: 'model_interest', kind: 'string' },
    { api: 'modelImageQuery', key: 'model_image_query', kind: 'string' },
    { api: 'modelImageScoring', key: 'model_image_scoring', kind: 'string' },
    { api: 'modelImageGeneration', key: 'model_image_generation', kind: 'string' },
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
    for (const def of SETTINGS) {
        const raw = await configService.getSetting(def.key, '');
        if (raw === '') {
            // Resolve to the typed default by reading through ConfigService's
            // typed getters where available, so the UI sees consistent defaults
            // instead of empty strings.
            result[def.api] = await resolveDefault(def);
        } else if (def.kind === 'int') {
            result[def.api] = parseInt(raw, 10);
        } else if (def.kind === 'float') {
            result[def.api] = parseFloat(raw);
        } else {
            result[def.api] = raw;
        }
    }
    res.json(result);
});

async function resolveDefault(def: SettingDef): Promise<any> {
    // Single source of truth for defaults lives in ConfigService. We reflect
    // through the typed getters so they stay in sync.
    const map: Record<string, () => Promise<any>> = {
        scrapeLimit: () => configService.getScrapeLimit(),
        articleRetentionHours: () => configService.getArticleRetentionHours(),
        articleCleanupCron: () => configService.getArticleCleanupCron(),
        imageSearchQueryTemplate: () => configService.getImageSearchQueryTemplate(),
        imageSearchUrlTemplate: () => configService.getImageSearchUrlTemplate(),
        imageMinScore: () => configService.getImageMinScore(),
        imagePoolSize: () => configService.getImagePoolSize(),
        imageScoringMaxRetries: () => configService.getImageScoringMaxRetries(),
        imagePerQueryCap: () => configService.getImagePerQueryCap(),
        imageMinWidth: () => configService.getImageMinWidth(),
        imageMinHeight: () => configService.getImageMinHeight(),
        imageQueryContentChars: () => configService.getImageQueryContentChars(),
        imageQueryMinLength: () => configService.getImageQueryMinLength(),
        imageQueryMaxCount: () => configService.getImageQueryMaxCount(),
        imageLeadMinChars: () => configService.getImageLeadMinChars(),
        imageLeadMaxChars: () => configService.getImageLeadMaxChars(),
        imageLeadMaxWords: () => configService.getImageLeadMaxWords(),
        imageSearchPageTimeoutMs: () => configService.getImageSearchPageTimeoutMs(),
        imageSearchSelectorTimeoutMs: () => configService.getImageSearchSelectorTimeoutMs(),
        imageFetchTimeoutMs: () => configService.getImageFetchTimeoutMs(),
        imageEngineFailureThreshold: () => configService.getImageEngineFailureThreshold(),
        modelEmbedding: () => configService.getEmbeddingModel(),
        modelRewrite: () => configService.getRewriteModel(),
        modelInterest: () => configService.getInterestModel(),
        modelImageQuery: () => configService.getImageQueryModel(),
        modelImageScoring: () => configService.getImageScoringModel(),
        modelImageGeneration: () => configService.getImageGenerationModel(),
        aiRewriteMaxTokens: () => configService.getRewriteMaxTokens(),
        aiRewriteContentChars: () => configService.getRewriteContentChars(),
        aiInterestMaxTokens: () => configService.getInterestMaxTokens(),
        aiInterestContentChars: () => configService.getInterestContentChars(),
        aiImageQueryMaxTokens: () => configService.getImageQueryMaxTokens(),
        aiImageQueryContentChars: () => configService.getImageQueryGenContentChars(),
        aiImageScoringMaxTokens: () => configService.getImageScoringMaxTokens(),
        aiImageScoringContentChars: () => configService.getImageScoringContentChars(),
        dedupThreshold: () => configService.getDedupThreshold(),
        embeddingTextChars: () => configService.getEmbeddingTextChars(),
        workflowDefaultWindowHours: () => configService.getDefaultArticleWindowHours()
    };
    const fn = map[def.api];
    return fn ? fn() : undefined;
}

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

// POST /api/articles/:id/publish - Publish article to a target (send email)
import { MailService } from './services/MailService';
import { AIService } from './services/AIService';
const mailService = new MailService();
const aiService = new AIService();

app.post('/api/articles/:id/publish', async (req, res) => {
    const { targetId, category } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId is required' });

    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        const target = await prisma.target.findUnique({ where: { id: targetId } });
        if (!target) return res.status(404).json({ error: 'Target not found' });

        console.log(`[MANUAL-PUBLISH] Publishing article to target: ${target.name}`);

        const articleForTarget = {
            ...article,
            rewrittenTitle: article.rewrittenTitle || article.originalTitle,
            rewrittenContent: article.rewrittenContent || article.originalContent
        };

        // Use provided category, or fall back to article's section
        const articleCategory = category || article.section || undefined;
        const sent = await mailService.sendArticleToTarget(target.email, articleForTarget as any, articleCategory);
        if (!sent) return res.status(500).json({ error: 'Failed to send email' });

        // Update article status to PUBLISHED
        await prisma.article.update({
            where: { id: req.params.id },
            data: { status: 'PUBLISHED' }
        });

        res.json({ success: true, message: `Article published to ${target.name}` });
    } catch (error) {
        console.error('Error publishing article:', error);
        res.status(500).json({ error: 'Failed to publish article' });
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
        const { rewrittenTitle, rewrittenContent } = req.body;
        const updated = await prisma.article.update({
            where: { id: req.params.id },
            data: { rewrittenTitle, rewrittenContent }
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
        const result = await aiService.rewriteContent(article.originalTitle, article.originalContent);

        const updated = await prisma.article.update({
            where: { id: article.id },
            data: {
                rewrittenTitle: result.title,
                rewrittenContent: result.content
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
            res.status(500).json({ error: 'Generation failed' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Error' });
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
        const isNewUrl = !currentCandidates.includes(imageUrl);

        const updatedCandidates = isNewUrl ? [...currentCandidates, imageUrl] : currentCandidates;
        const currentScores: Record<string, number> = ((article as any).imageScores as Record<string, number>) || {};
        const updatedScores = isNewUrl ? { ...currentScores, [imageUrl]: 5 } : currentScores;

        await prisma.article.update({
            where: { id: req.params.id },
            data: {
                featureImageUrl: imageUrl,
                imageCandidates: updatedCandidates,
                imageScores: updatedScores
            }
        });

        res.json({ success: true, candidates: updatedCandidates, imageScores: updatedScores });
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
        const images = await imageService.searchImages({
            title: article.originalTitle,
            content: article.originalContent,
            rewrittenTitle: article.rewrittenTitle || undefined
        });

        // Actually findOrGenerate calls both. We might want just search.
        // But findOrGenerate is fine.

        // Update DB
        const currentCandidates = (article as any).imageCandidates || [];
        // Filter duplicates
        const newCandidates = images.filter(img => !currentCandidates.includes(img));
        const updatedCandidates = [...currentCandidates, ...newCandidates];

        await prisma.article.update({
            where: { id: article.id },
            data: { imageCandidates: updatedCandidates }
        });

        res.json({ candidates: updatedCandidates });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Search failed' });
    }
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

server.on('error', (err) => {
    console.error('Server failed to start:', err);
});
