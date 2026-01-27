import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { ClarinScraper } from '../scrapers/ClarinScraper';
import { ProcessorService } from './ProcessorService';

// Connection config
const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
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

    async addScrapeJob(source: string, url: string) {
        console.log(`[Queue] Adding scrape job for ${source}`);
        await this.scraperQueue.add('scrape', { source, url });
    }

    private setupWorkers() {
        console.log('[Queue] Setting up workers...');

        // Scraper Worker
        new Worker(QUEUES.SCRAPER, async (job: Job) => {
            console.log(`[Worker] Processing job ${job.id}: ${job.data.source}`);

            if (job.data.source === 'Clarin') {
                const scraper = new ClarinScraper();
                const articles = await scraper.scrape();
                console.log(`[Worker] Scraped ${articles.length} articles from Clarin`);

                console.log(`[Worker] Scraped ${articles.length} articles from Clarin. Starting processing...`);

                try {
                    // Pipeline Integration
                    console.log('[Worker] Invoking processScrapedArticles...');
                    const processor = new ProcessorService();
                    await processor.processScrapedArticles('Clarin', articles);
                    console.log('[Worker] Processing complete.');
                } catch (err) {
                    console.error('[Worker] PIPELINE ERROR:', err);
                }

                return articles;
            }

        }, { connection });
    }
}
