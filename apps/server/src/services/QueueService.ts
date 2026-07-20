import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { ClarinScraper } from '../scrapers/ClarinScraper';
import { LaNacionScraper } from '../scrapers/LaNacionScraper';
import { InfobaeScraper } from '../scrapers/InfobaeScraper';
import { TNScraper } from '../scrapers/TNScraper';
import { NAScraper } from '../scrapers/NAScraper';
import { AmbitoScraper } from '../scrapers/AmbitoScraper';
import { CronistaScraper } from '../scrapers/CronistaScraper';
import { ProcessorService } from './ProcessorService';
import { notificationService } from './NotificationService';
import { PrismaClient, ScrapeRunStatus, ScrapeRunTrigger } from '@prisma/client';

const prisma = new PrismaClient();

type ScrapeJobOptions = {
    sectionName?: string;
    trigger?: ScrapeRunTrigger;
};

// Connection config
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

    async addScrapeJob(source: string, url?: string, limit: number = 30, options: ScrapeJobOptions = {}) {
        console.log(`[Queue] Adding scrape job for ${source}${options.sectionName ? ` / ${options.sectionName}` : ''} with limit ${limit}`);
        const run = await prisma.scrapeRun.create({
            data: {
                source,
                sectionName: options.sectionName || null,
                path: url || null,
                requestedLimit: limit,
                status: ScrapeRunStatus.QUEUED,
                trigger: options.trigger || ScrapeRunTrigger.MANUAL
            }
        });

        try {
            const job = await this.scraperQueue.add('scrape', {
                source,
                url,
                limit,
                sectionName: options.sectionName,
                trigger: options.trigger || ScrapeRunTrigger.MANUAL,
                scrapeRunId: run.id
            });

            await prisma.scrapeRun.update({
                where: { id: run.id },
                data: { queueJobId: String(job.id) }
            });
        } catch (error: any) {
            const finishedAt = new Date();
            await prisma.scrapeRun.update({
                where: { id: run.id },
                data: {
                    status: ScrapeRunStatus.ERROR,
                    finishedAt,
                    durationMs: finishedAt.getTime() - run.startedAt.getTime(),
                    errorMessage: error?.message || 'No se pudo encolar el scrapeo.'
                }
            });
            throw error;
        }
    }

    async cancelScrapeRun(runId: string) {
        const run = await prisma.scrapeRun.findUnique({ where: { id: runId } });
        if (!run) {
            throw new Error('Scrape run not found');
        }

        if (run.status !== ScrapeRunStatus.QUEUED && run.status !== ScrapeRunStatus.RUNNING) {
            return run;
        }

        const cancelledAt = new Date();

        if (run.status === ScrapeRunStatus.QUEUED) {
            if (run.queueJobId) {
                const job = await this.scraperQueue.getJob(run.queueJobId);
                if (job) {
                    const state = await job.getState();
                    if (state === 'active') {
                        return prisma.scrapeRun.update({
                            where: { id: run.id },
                            data: {
                                cancelRequested: true,
                                cancelledAt,
                                errorMessage: 'Cancelación solicitada; se cortará antes de procesar nuevas notas.'
                            }
                        });
                    }

                    if (!['completed', 'failed'].includes(state)) {
                        try {
                            await job.remove();
                        } catch {
                            return prisma.scrapeRun.update({
                                where: { id: run.id },
                                data: {
                                    cancelRequested: true,
                                    cancelledAt,
                                    errorMessage: 'Cancelación solicitada; el job ya había empezado.'
                                }
                            });
                        }
                    }
                }
            }

            return prisma.scrapeRun.update({
                where: { id: run.id },
                data: {
                    status: ScrapeRunStatus.CANCELLED,
                    cancelRequested: true,
                    cancelledAt,
                    finishedAt: cancelledAt,
                    durationMs: cancelledAt.getTime() - run.startedAt.getTime(),
                    errorMessage: 'Cancelado antes de ejecutar.'
                }
            });
        }

        return prisma.scrapeRun.update({
            where: { id: run.id },
            data: {
                cancelRequested: true,
                cancelledAt,
                errorMessage: 'Cancelación solicitada; se cortará antes de procesar nuevas notas.'
            }
        });
    }

    private setupWorkers() {
        // Scraper Registry
        const scraperRegistry: Record<string, any> = {
            'Clarin': ClarinScraper,
            'LaNacion': LaNacionScraper,
            'Infobae': InfobaeScraper,
            'TN': TNScraper,
            'NA': NAScraper,
            'Ambito': AmbitoScraper,
            'Cronista': CronistaScraper,
        };

        // Scraper Worker
        new Worker(QUEUES.SCRAPER, async (job: Job) => {
            console.log(`[Worker] Processing job ${job.id}: ${job.data.source} - ${job.data.url || 'No URL custom'} - Limit: ${job.data.limit}`);

            const limit = job.data.limit || 30;
            const startedAt = new Date();
            const run = job.data.scrapeRunId
                ? await prisma.scrapeRun.update({
                    where: { id: job.data.scrapeRunId },
                    data: {
                        status: ScrapeRunStatus.RUNNING,
                        startedAt,
                        queueJobId: String(job.id)
                    }
                })
                : await prisma.scrapeRun.create({
                    data: {
                    source: job.data.source,
                    sectionName: job.data.sectionName || null,
                    path: job.data.url || null,
                    requestedLimit: limit,
                    status: ScrapeRunStatus.RUNNING,
                    trigger: job.data.trigger || ScrapeRunTrigger.MANUAL,
                    queueJobId: String(job.id)
                    }
                });

            const finishRun = async (
                status: ScrapeRunStatus,
                scrapedCount: number,
                processedCount: number,
                errorMessage?: string,
                diagnostics?: any
            ) => {
                const finishedAt = new Date();
                await prisma.scrapeRun.update({
                    where: { id: run.id },
                    data: {
                        status,
                        scrapedCount,
                        processedCount,
                        finishedAt,
                        durationMs: finishedAt.getTime() - startedAt.getTime(),
                        errorMessage: errorMessage ? errorMessage.slice(0, 1000) : null,
                        diagnostics: diagnostics || undefined
                    }
                });
            };

            const isCancellationRequested = async () => {
                const fresh = await prisma.scrapeRun.findUnique({
                    where: { id: run.id },
                    select: { cancelRequested: true, cancelledAt: true }
                });
                return !!fresh?.cancelRequested;
            };

            const ScraperClass = scraperRegistry[job.data.source];

            if (!ScraperClass) {
                console.error(`[Worker] Unknown source: ${job.data.source}`);
                await finishRun(ScrapeRunStatus.ERROR, 0, 0, `Unknown source: ${job.data.source}`);
                await notificationService.emit({
                    level: 'ERROR',
                    source: 'SCRAPER',
                    title: `Medio desconocido: ${job.data.source}`,
                    message: `No hay scraper registrado para "${job.data.source}". Revisá la configuración.`,
                    metadata: { source: job.data.source, url: job.data.url }
                });
                return;
            }

            let scraper: any;
            try {
                if (await isCancellationRequested()) {
                    await finishRun(ScrapeRunStatus.CANCELLED, 0, 0, 'Cancelado antes de iniciar el scraper.');
                    return [];
                }

                scraper = new ScraperClass();
                // If the job url is a path (e.g. /politica), append it to the base URL
                if (job.data.url) {
                    const isFullPath = job.data.url.startsWith('http');
                    scraper.baseUrl = isFullPath ? job.data.url : `${scraper.baseUrl}${job.data.url}`;
                }

                console.log(`[Worker] Starting scrape for ${job.data.source} with limit ${limit}...`);
                const articles = await scraper.scrape(limit);
                const diagnostics = scraper.getDiagnostics?.();
                console.log(`[Worker] Scraped ${articles.length} articles from ${job.data.source}.`);

                if (await isCancellationRequested()) {
                    await finishRun(ScrapeRunStatus.CANCELLED, articles.length, 0, 'Cancelado antes de procesar notas.');
                    return articles;
                }

                if (articles.length === 0) {
                    await notificationService.emit({
                        level: 'WARN',
                        source: 'SCRAPER',
                        title: `${job.data.source}: scraping vacío`,
                        message: `No se extrajeron artículos${job.data.url ? ` de ${job.data.url}` : ''}. Puede haber un bloqueo del sitio o cambios en su HTML.`,
                        metadata: { source: job.data.source, url: job.data.url, limit, diagnostics }
                    });
                }

                let processedCount = 0;
                let processingDiagnostics: any;
                if (articles.length > 0) {
                    // Pipeline Integration
                    console.log('[Worker] Invoking processScrapedArticles...');
                    const processor = new ProcessorService();
                    const processing = await processor.processScrapedArticles(job.data.source, articles);
                    processedCount = processing.processedArticles.length;
                    processingDiagnostics = processing.diagnostics;
                    console.log('[Worker] Processing complete.');
                }

                const runDiagnostics = processingDiagnostics
                    ? { ...diagnostics, processing: processingDiagnostics }
                    : diagnostics;

                await finishRun(
                    articles.length === 0 ? ScrapeRunStatus.EMPTY : ScrapeRunStatus.SUCCESS,
                    articles.length,
                    processedCount,
                    undefined,
                    runDiagnostics
                );

                return articles;

            } catch (err: any) {
                console.error(`[Worker] Error scraping ${job.data.source}:`, err);
                await finishRun(ScrapeRunStatus.ERROR, 0, 0, err?.message || String(err) || 'Unknown scraping error', scraper?.getDiagnostics?.());
                await notificationService.emit({
                    level: 'ERROR',
                    source: 'SCRAPER',
                    title: `${job.data.source}: error al scrapear`,
                    message: err?.message || String(err) || 'Error desconocido durante el scraping.',
                    metadata: { source: job.data.source, url: job.data.url }
                });
                throw err;
            }

        }, { connection });
    }
}
