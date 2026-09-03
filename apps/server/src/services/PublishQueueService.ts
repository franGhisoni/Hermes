import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma';
import { VorknewsPublishService } from './VorknewsPublishService';
import { MailService } from './MailService';
import { notificationService } from './NotificationService';

export interface PublishJobData {
    articleId: string;
    targetId: string;
    mode?: 'DRAFT' | 'PUBLISHED';
    sectionId?: string;
    author?: string;
    volanta?: string;
    bajada?: string;
    tags?: string;
    title?: string;
    contentHtml?: string;
    category?: string;
}

const connection = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
    };

export class PublishQueueService {
    private queue: Queue | null = null;
    private worker: Worker | null = null;
    private vorknewsService: VorknewsPublishService;
    private mailService: MailService;
    private inMemoryQueue: PublishJobData[] = [];
    private isProcessing = false;

    constructor() {
        this.vorknewsService = new VorknewsPublishService();
        this.mailService = new MailService();

        try {
            this.queue = new Queue('publish-queue', { connection });
            this.worker = new Worker('publish-queue', async (job) => {
                await this.processJob(job.data);
            }, {
                connection,
                concurrency: 1 // Sequential processing to prevent CPU/RAM contention from Puppeteer
            });

            this.worker.on('failed', (job, err) => {
                console.error(`[PublishQueue] Job ${job?.id} failed:`, err);
            });

            console.log('[PublishQueue] BullMQ publish queue & worker initialized.');
        } catch (err) {
            console.warn('[PublishQueue] Redis queue init notice (falling back to in-memory queue):', err);
            this.queue = null;
            this.worker = null;
        }
    }

    public async enqueue(jobData: PublishJobData): Promise<{ queued: boolean; jobId?: string }> {
        // Immediately persist user's edited SEO fields into DB before queuing
        try {
            const currentArticle = await prisma.article.findUnique({
                where: { id: jobData.articleId }
            });
            if (currentArticle) {
                const existingData = (currentArticle.editorialData as any) || {};
                await prisma.article.update({
                    where: { id: jobData.articleId },
                    data: {
                        rewrittenTitle: jobData.title || currentArticle.rewrittenTitle,
                        rewrittenContent: jobData.contentHtml || currentArticle.rewrittenContent,
                        contentPreview: jobData.bajada || currentArticle.contentPreview,
                        editorialData: {
                            ...existingData,
                            publishing: true,
                            publishError: null,
                            seo: {
                                title: jobData.title || currentArticle.rewrittenTitle,
                                content: jobData.contentHtml || currentArticle.rewrittenContent,
                                volanta: jobData.volanta || existingData?.seo?.volanta || '',
                                bajada: jobData.bajada || existingData?.seo?.bajada || '',
                                tags: jobData.tags || existingData?.seo?.tags || ''
                            }
                        }
                    }
                });
            }
        } catch (saveErr) {
            console.warn('[PublishQueue] Warning saving pre-publish article state:', saveErr);
        }

        if (this.queue) {
            try {
                const job = await this.queue.add('publish-article', jobData, {
                    attempts: 1,
                    removeOnComplete: 100,
                    removeOnFail: 100
                });
                return { queued: true, jobId: job.id };
            } catch (queueErr) {
                console.warn('[PublishQueue] BullMQ add failed, switching to in-memory fallback:', queueErr);
            }
        }

        // In-memory queue fallback
        this.inMemoryQueue.push(jobData);
        this.triggerInMemoryQueue();
        return { queued: true };
    }

    private triggerInMemoryQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        setImmediate(async () => {
            while (this.inMemoryQueue.length > 0) {
                const next = this.inMemoryQueue.shift();
                if (next) {
                    try {
                        await this.processJob(next);
                    } catch (e) {
                        console.error('[PublishQueue] In-memory job error:', e);
                    }
                }
            }
            this.isProcessing = false;
        });
    }

    private async processJob(jobData: PublishJobData) {
        let article: any = null;
        try {
            article = await prisma.article.findUnique({
                where: { id: jobData.articleId },
                include: { source: true }
            });
            if (!article) throw new Error('Artículo no encontrado en la base de datos');

            const target = await prisma.target.findUnique({
                where: { id: jobData.targetId }
            });
            if (!target) throw new Error('Medio destino no encontrado');

            const isVorknews = target.type === 'VORKNEWS'
                || target.name.toLowerCase().includes('política del sur')
                || target.name.toLowerCase().includes('politica del sur');

            if (isVorknews) {
                console.log(`[PublishQueue] Starting background publish for "${jobData.title || article.rewrittenTitle}" to Vorknews...`);
                const result = await this.vorknewsService.publishArticle(article, {
                    mode: jobData.mode || 'DRAFT',
                    sectionId: jobData.sectionId,
                    author: jobData.author,
                    volanta: jobData.volanta,
                    bajada: jobData.bajada,
                    tags: jobData.tags,
                    title: jobData.title,
                    contentHtml: jobData.contentHtml
                });

                if (!result.success) {
                    throw new Error(result.error || 'Error en la respuesta del CMS Vorknews');
                }

                const modeLabel = result.mode === 'DRAFT' ? 'borrador' : 'publicada';
                const finalTitle = jobData.title || article.rewrittenTitle || article.originalTitle;

                // Update article status to PUBLISHED
                await prisma.article.update({
                    where: { id: article.id },
                    data: {
                        status: 'PUBLISHED',
                        rewrittenTitle: jobData.title || article.rewrittenTitle,
                        rewrittenContent: jobData.contentHtml || article.rewrittenContent,
                        contentPreview: jobData.bajada || article.contentPreview,
                        editorialData: {
                            ...((article.editorialData as any) || {}),
                            publishing: false,
                            vorknewsId: result.vorknewsId,
                            seo: {
                                title: jobData.title || article.rewrittenTitle,
                                content: jobData.contentHtml || article.rewrittenContent,
                                volanta: jobData.volanta,
                                bajada: jobData.bajada,
                                tags: jobData.tags
                            }
                        }
                    }
                });

                // Emit SUCCESS notification (visible to basic users and admins)
                await notificationService.emit({
                    level: 'INFO',
                    source: 'PUBLISH',
                    title: 'Noticia publicada en Política del Sur',
                    message: `"${finalTitle}" se guardó con éxito como ${modeLabel} en Política del Sur${result.vorknewsId ? ` (ID: ${result.vorknewsId})` : ''}.`,
                    metadata: {
                        articleId: article.id,
                        vorknewsId: result.vorknewsId,
                        mode: result.mode,
                        target: 'vorknews'
                    }
                });

                console.log(`[PublishQueue] Successfully published article "${finalTitle}" to Vorknews (ID: ${result.vorknewsId || 'N/A'}).`);

            } else {
                // Email target
                if (!target.email) throw new Error('El destino no tiene dirección de email configurada');
                console.log(`[PublishQueue] Sending article by email to ${target.email}...`);

                const sent = await this.mailService.sendArticleToTarget(
                    target.email,
                    article as any,
                    jobData.category || article.section || undefined
                );
                if (!sent) throw new Error(`Falló el despacho de email a ${target.name}`);

                await prisma.article.update({
                    where: { id: article.id },
                    data: {
                        status: 'PUBLISHED',
                        editorialData: {
                            ...((article.editorialData as any) || {}),
                            publishing: false
                        }
                    }
                });

                const finalTitle = jobData.title || article.rewrittenTitle || article.originalTitle;
                await notificationService.emit({
                    level: 'INFO',
                    source: 'PUBLISH',
                    title: 'Noticia despachada por email',
                    message: `"${finalTitle}" fue enviada a ${target.name} con éxito.`,
                    metadata: { articleId: article.id, targetName: target.name }
                });
            }
        } catch (error: any) {
            console.error('[PublishQueue] Error during background publication:', error);

            if (article) {
                await prisma.article.update({
                    where: { id: article.id },
                    data: {
                        editorialData: {
                            ...((article.editorialData as any) || {}),
                            publishing: false,
                            publishError: error.message
                        }
                    }
                }).catch(() => {});
            }

            const finalTitle = jobData.title || article?.rewrittenTitle || article?.originalTitle || 'Nota';
            await notificationService.emit({
                level: 'ERROR',
                source: 'PUBLISH',
                title: 'Error al publicar noticia',
                message: `No se pudo publicar "${finalTitle}": ${error.message || 'Error desconocido'}`,
                metadata: {
                    articleId: jobData.articleId,
                    error: error.message
                }
            });
        }
    }
}

export const publishQueueService = new PublishQueueService();
