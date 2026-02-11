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

const queueService = new QueueService();
const articleService = new ArticleService();

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

// Config API
import { ConfigService } from './services/ConfigService';
const configService = new ConfigService();

// POST /api/scrape - Manual Trigger
app.post('/api/scrape', async (req, res) => {
    const { source, url, limit } = req.body;
    if (!source) {
        return res.status(400).json({ error: 'Missing source' });
    }

    try {
        // Use provided limit, or fetch from DB, or default to 3
        let effectiveLimit = limit;
        if (!effectiveLimit) {
            effectiveLimit = await configService.getScrapeLimit();
        }

        await queueService.addScrapeJob(source, url, effectiveLimit);
        res.json({ message: 'Scrape job started', source, limit: effectiveLimit });
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

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});
