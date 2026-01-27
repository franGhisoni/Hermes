import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { QueueService } from './services/QueueService';
import { ArticleService } from './services/ArticleService';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
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

// POST /api/scrape - Manual Trigger
app.post('/api/scrape', async (req, res) => {
    const { source, url } = req.body;
    if (!source || !url) {
        return res.status(400).json({ error: 'Missing source or url' });
    }

    try {
        await queueService.addScrapeJob(source, url);
        res.json({ message: 'Scrape job started', source });
    } catch (error) {
        console.error('Error starting scrape:', error);
        res.status(500).json({ error: 'Failed to start job' });
    }
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
