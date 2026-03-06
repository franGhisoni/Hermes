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
import bcrypt from 'bcrypt';

import { SchedulerService } from './services/SchedulerService';

const queueService = new QueueService();
const articleService = new ArticleService();
export const schedulerService = new SchedulerService(queueService, articleService);

schedulerService.initialize();

// Init default admin user on boot
async function initAdmin() {
    try {
        const adminExists = await prisma.user.findFirst();
        if (!adminExists) {
            const passwordHash = await bcrypt.hash('admin', 10);
            await prisma.user.create({
                data: { username: 'admin', passwordHash, role: 'ADMIN' }
            });
            console.log('Default admin user created (admin/admin).');
        }
    } catch (e) {
        console.error('Failed to init admin user:', e);
    }
}
initAdmin();

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

// Protected global routers
app.use('/api/users', userRouter);
app.use('/api/targets', targetRouter);

// Global auth guard for the rest of the API
app.use('/api', requireAuth);

// GET /api/articles - List all articles
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await articleService.getAllArticles();
        res.json(articles);
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

        // Queue a scrape job for each section
        for (const section of sections) {
            await queueService.addScrapeJob(source, section.path, effectiveLimit);
        }

        res.json({ message: `Scrape jobs started for ${sections.length} sections`, source, jobs: sections.length, limit: effectiveLimit });
    } catch (error) {
        console.error('Error starting scrape:', error);
        res.status(500).json({ error: 'Failed to start job' });
    }
});

app.get('/api/config/settings', async (req, res) => {
    const limit = await configService.getScrapeLimit();
    res.json({ scrapeLimit: limit });
});

app.post('/api/config/settings', async (req, res) => {
    const { scrapeLimit } = req.body;
    if (scrapeLimit) {
        await configService.setSetting('scrape_limit', scrapeLimit.toString());
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
const mailService = new MailService();

app.post('/api/articles/:id/publish', async (req, res) => {
    const { targetId, category } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId is required' });

    try {
        const article = await articleService.getArticleById(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        const target = await prisma.target.findUnique({ where: { id: targetId } });
        if (!target) return res.status(404).json({ error: 'Target not found' });

        // Use provided category, or fall back to article's section
        const articleCategory = category || article.section || undefined;
        const sent = await mailService.sendArticleToTarget(target.email, article, articleCategory);
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
app.put('/api/articles/:id/select-image', async (req, res) => {
    const { imageUrl } = req.body;
    try {
        const article = await articleService.getArticleById(req.params.id);
        // Ensure we are selecting from valid candidates or just update (trusting client for now or could validate)
        await prisma.article.update({
            where: { id: req.params.id },
            data: { featureImageUrl: imageUrl }
        });
        res.json({ success: true });
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
        const images = await imageService.searchImages(article.originalTitle);

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
