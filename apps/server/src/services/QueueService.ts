import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { ClarinScraper } from '../scrapers/ClarinScraper';
import { LaNacionScraper } from '../scrapers/LaNacionScraper';
import { InfobaeScraper } from '../scrapers/InfobaeScraper';
import { TNScraper } from '../scrapers/TNScraper';
import { NAScraper } from '../scrapers/NAScraper';
import { ProcessorService } from './ProcessorService';

// Connection config
const connection = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
    };

// Queue Names
export const QUEUES = {
    SCRAPER: 'scraper-queue',
    PROCESSOR: 'processor-queue'
};

export class QueueService {
    private scraperQueue: Queue;

    constructor() {
        this.scraperQueue = new Queue(QUEUES.SCRAPER, { connection });
        this.setupWorkers();
    }

    async addScrapeJob(source: string, url: string, limit: number = 30) {
        console.log(`[Queue] Adding scrape job for ${source} with limit ${limit}`);
        await this.scraperQueue.add('scrape', { source, url, limit });
    }

    private setupWorkers() {
        // Scraper Registry
        const scraperRegistry: Record<string, any> = {
            'Clarin': ClarinScraper,
            'LaNacion': LaNacionScraper,
            'Infobae': InfobaeScraper,
            'TN': TNScraper,
            'NA': NAScraper,
        };

        // Scraper Worker
        new Worker(QUEUES.SCRAPER, async (job: Job) => {
            console.log(`[Worker] Processing job ${job.id}: ${job.data.source} - ${job.data.url || 'No URL custom'} - Limit: ${job.data.limit}`);

            const ScraperClass = scraperRegistry[job.data.source];

            if (!ScraperClass) {
                console.error(`[Worker] Unknown source: ${job.data.source}`);
                return;
            }

            try {
                const scraper = new ScraperClass();
                // Pass URL if provided (generic support)
                if (job.data.url) {
                    scraper.baseUrl = job.data.url;
                }

                const limit = job.data.limit || 30;

                console.log(`[Worker] Starting scrape for ${job.data.source} with limit ${limit}...`);
                const articles = await scraper.scrape(limit);
                console.log(`[Worker] Scraped ${articles.length} articles from ${job.data.source}.`);

                if (articles.length > 0) {
                    // Pipeline Integration
                    console.log('[Worker] Invoking processScrapedArticles...');
                    const processor = new ProcessorService();
                    await processor.processScrapedArticles(job.data.source, articles);
                    console.log('[Worker] Processing complete.');
                }

                return articles;

            } catch (err) {
                console.error(`[Worker] Error scraping ${job.data.source}:`, err);
                throw err;
            }

        }, { connection });
    }
}
