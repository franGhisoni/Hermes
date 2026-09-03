import cron, { ScheduledTask } from 'node-cron';
import { Article, ScrapeRunTrigger, WorkflowRunStatus } from '@prisma/client';
import { QueueService } from './QueueService';
import { MailService } from './MailService';
import { ArticleService } from './ArticleService';
import { ConfigService } from './ConfigService';
import { AIService } from './AIService';
import { ImageService } from './ImageService';
import { notificationService } from './NotificationService';
import { prisma } from '../lib/prisma';

interface RunStats {
    targetsTotal: number;
    targetsCovered: number;
    targetsSkipped: number;
    articlesUnique: number;
    articlesRefilled: number;
}

interface PublicationSlot {
    target: any;
    section?: string;
    excludedSections: Set<string>;
}

export class SchedulerService {
    private queueService: QueueService;
    private mailService: MailService;
    private articleService: ArticleService;
    private configService: ConfigService;
    private aiService: AIService;
    private activeJobs: Map<string, ScheduledTask> = new Map();

    constructor(queueService: QueueService, articleService: ArticleService) {
        this.queueService = queueService;
        this.articleService = articleService;
        this.mailService = new MailService();
        this.configService = new ConfigService();
        this.aiService = new AIService();
    }

    public async initialize() {
        console.log('Initializing Scheduler Service...');
        this.stopAll();

        try {
            // 0. Register retention cleanup
            await this.scheduleArticleCleanup();
            await this.cleanupExpiredArticles();

            // 1. Load and schedule scrape schedules
            const scrapeSchedules = await prisma.scrapeSchedule.findMany({
                where: { isActive: true }
            });
            for (const schedule of scrapeSchedules) {
                this.scheduleScrapeJob(schedule);
            }
            console.log(`Registered ${scrapeSchedules.length} active scrape schedules.`);

            // 2. Load and schedule publish workflows
            const workflows = await prisma.workflow.findMany({
                where: { isActive: true },
                include: { targets: true }
            });
            for (const workflow of workflows) {
                this.scheduleWorkflow(workflow);
            }
            console.log(`Registered ${workflows.length} active publish workflows.`);
        } catch (error) {
            console.error('Failed to load schedules:', error);
        }
    }

    public async scheduleArticleCleanup() {
        const jobId = 'cleanup_articles_retention';

        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId)!.stop();
            this.activeJobs.delete(jobId);
        }

        const cleanupCron = await this.configService.getArticleCleanupCron();
        if (!cron.validate(cleanupCron)) {
            console.error(`Invalid cron for article cleanup: ${cleanupCron}`);
            return;
        }

        const task = cron.schedule(cleanupCron, async () => {
            await this.cleanupExpiredArticles();
        });

        this.activeJobs.set(jobId, task);
        console.log(`Scheduled article cleanup every [${cleanupCron}]`);
    }

    private async cleanupExpiredArticles() {
        try {
            const retentionHours = await this.configService.getArticleRetentionHours();
            const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
            console.log(`[CRON-CLEANUP] Removing articles older than ${retentionHours}h (before ${cutoff.toISOString()})...`);

            const { count } = await prisma.article.deleteMany({
                where: {
                    createdAt: { lt: cutoff }
                }
            });

            const deletedImages = await this.cleanupOrphanGeneratedImages(cutoff);
            console.log(`[CRON-CLEANUP] Deleted ${count} expired articles and ${deletedImages} orphan generated images.`);
        } catch (error) {
            console.error('[CRON-CLEANUP] Failed to cleanup expired articles:', error);
        }
    }

    private async cleanupOrphanGeneratedImages(cutoff: Date): Promise<number> {
        const remainingArticles = await prisma.article.findMany({
            select: {
                featureImageUrl: true,
                imageCandidates: true
            }
        });

        const referencedImageIds = new Set<string>();
        for (const article of remainingArticles) {
            const featureId = this.extractInternalImageId(article.featureImageUrl);
            if (featureId) referencedImageIds.add(featureId);

            for (const candidate of article.imageCandidates || []) {
                const candidateId = this.extractInternalImageId(candidate);
                if (candidateId) referencedImageIds.add(candidateId);
            }
        }

        const where: any = {
            createdAt: { lt: cutoff }
        };
        if (referencedImageIds.size > 0) {
            where.id = { notIn: Array.from(referencedImageIds) };
        }

        const { count } = await prisma.generatedImage.deleteMany({ where });
        return count;
    }

    private extractInternalImageId(imageUrl?: string | null): string | null {
        if (!imageUrl) return null;
        const match = imageUrl.match(/^\/api\/images\/([^\/\?]+)/);
        return match?.[1] || null;
    }

    // ---- SCRAPE SCHEDULES ----

    public scheduleScrapeJob(schedule: any) {
        const jobId = `scrape_${schedule.id}`;

        // Unschedule existing if any
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId)!.stop();
            this.activeJobs.delete(jobId);
        }

        if (!schedule.isActive) return;

        if (!cron.validate(schedule.cron)) {
            console.error(`Invalid cron for scrape schedule ${schedule.source}: ${schedule.cron}`);
            return;
        }

        const task = cron.schedule(schedule.cron, async () => {
            console.log(`[CRON-SCRAPE] Scraping ${schedule.source}...`);
            try {
                // Resolve the global scrape limit once per tick, then let each
                // section override it via its own scrapeLimit field.
                const defaultLimit = await this.configService.getScrapeLimit();
                const sections = await prisma.section.findMany({
                    include: { overrides: { where: { source: schedule.source } } }
                });

                if (sections.length === 0) {
                    await this.queueService.addScrapeJob(schedule.source, undefined, defaultLimit, {
                        trigger: ScrapeRunTrigger.SCHEDULED
                    });
                } else {
                    for (const section of sections) {
                        const override = section.overrides[0];
                        if (override && override.enabled === false) continue;
                        const path = override?.path ?? section.path;
                        const limit = override?.scrapeLimit ?? section.scrapeLimit ?? defaultLimit;
                        await this.queueService.addScrapeJob(schedule.source, path, limit, {
                            sectionName: section.name,
                            trigger: ScrapeRunTrigger.SCHEDULED
                        });
                    }
                }
            } catch (error) {
                console.error(`[CRON-SCRAPE] Failed for ${schedule.source}:`, error);
            }
        });

        this.activeJobs.set(jobId, task);
        console.log(`Scheduled scrape: ${schedule.source} [${schedule.cron}]`);
    }

    public unscheduleScrapeJob(scheduleId: string) {
        const jobId = `scrape_${scheduleId}`;
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId)!.stop();
            this.activeJobs.delete(jobId);
            console.log(`Unscheduled scrape: ${scheduleId}`);
        }
    }

    // ---- PUBLISH WORKFLOWS ----

    public scheduleWorkflow(workflow: any) {
        const jobId = `workflow_${workflow.id}`;

        // Unschedule existing if any
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId)!.stop();
            this.activeJobs.delete(jobId);
        }

        if (!workflow.isActive) return;

        if (!cron.validate(workflow.cron)) {
            console.error(`Invalid cron for workflow ${workflow.name}: ${workflow.cron}`);
            return;
        }

        const task = cron.schedule(workflow.cron, async () => {
            await this.executeWorkflow(workflow);
        });

        this.activeJobs.set(jobId, task);
        console.log(`Scheduled workflow: ${workflow.name} -> ${workflow.targets?.length || 0} targets [${workflow.cron}]`);
    }

    private async executeWorkflow(workflow: any) {
        console.log(`[CRON-PUBLISH] Executing workflow: ${workflow.name}`);
        const startedAt = Date.now();

        // Re-load the workflow so we get an up-to-date cursor (the cached
        // closure value can be stale if previous runs already advanced it).
        const fresh = await prisma.workflow.findUnique({
            where: { id: workflow.id },
            include: { targets: true, targetLimits: true }
        });
        if (!fresh) {
            console.error(`[CRON-PUBLISH] Workflow ${workflow.id} no longer exists.`);
            return;
        }

        // Deterministic target ordering by id so the cursor refers to the same
        // destination across runs even if Prisma's join order changes.
        const sortedTargets = [...(fresh.targets || [])].sort((a, b) => a.id.localeCompare(b.id));

        // Rotate so the run starts from the cursor — destinations skipped in
        // the previous cycle land at the front of this cycle's queue.
        const cursor = sortedTargets.length === 0 ? 0 : (fresh.nextTargetIndex ?? 0) % sortedTargets.length;
        const targets = [...sortedTargets.slice(cursor), ...sortedTargets.slice(0, cursor)];

        const stats: RunStats = {
            targetsTotal: 0,
            targetsCovered: 0,
            targetsSkipped: 0,
            articlesUnique: 0,
            articlesRefilled: 0
        };

        if (targets.length === 0) {
            await this.recordRun(workflow.id, 'EMPTY', startedAt, stats, 'El flujo no tiene destinos configurados.');
            return;
        }

        try {
            const windowHours = fresh.articleWindowHours
                ?? await this.configService.getDefaultArticleWindowHours();
            const where: any = {
                status: 'PENDING',
                createdAt: { gte: new Date(Date.now() - windowHours * 60 * 60 * 1000) }
            };
            if (fresh.section) where.section = fresh.section;
            if (fresh.sources?.length > 0) where.source = { name: { in: fresh.sources } };
            if (fresh.minScore !== null && fresh.minScore !== undefined) {
                where.interestScore = { gte: fresh.minScore };
            }

            const slots = this.buildPublicationSlots(fresh, targets);
            stats.targetsTotal = slots.length;
            if (slots.length === 0) {
                const msg = 'El flujo no tiene cupos de publicación configurados.';
                await this.recordRun(workflow.id, 'EMPTY', startedAt, stats, msg);
                return;
            }

            // Fetch enough candidates to satisfy all medium/section quotas. The
            // extra headroom lets a section override find an eligible note even
            // when newer notes belong to another section.
            const articles = await prisma.article.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: Math.min(Math.max(slots.length * 4, 100), 2000)
            });

            if (articles.length === 0) {
                const msg = 'No se encontraron artículos PENDING en la ventana.';
                console.log(`[CRON-PUBLISH] ${fresh.name}: ${msg}`);
                await this.recordRun(workflow.id, 'EMPTY', startedAt, stats, msg);
                return;
            }

            const usedArticleIds = new Set<string>();
            for (const slot of slots) {
                const article = this.takeArticleForSlot(articles, slot, usedArticleIds, fresh.allowRepublish);
                if (!article) {
                    stats.targetsSkipped++;
                    continue;
                }

                const isRefill = usedArticleIds.has(article.id);
                if (!isRefill) usedArticleIds.add(article.id);

                const target = slot.target;
                try {
                    const dispatchArticle = isRefill
                        ? await this.buildRepublishedVariant(article)
                        : article;
                    const category = fresh.targetCategory || dispatchArticle.section || undefined;
                    const ok = await this.mailService.sendArticleToTarget(target.email, dispatchArticle, category);
                    if (!ok) continue;

                    stats.targetsCovered++;
                    if (isRefill) stats.articlesRefilled++;
                    if (!dispatchArticle.featureImageUrl && !dispatchArticle.originalImageUrl) {
                        await notificationService.emit({
                            level: 'WARN',
                            source: 'PUBLISH',
                            title: 'Publicación sin imagen',
                            message: `"${dispatchArticle.rewrittenTitle || dispatchArticle.originalTitle}" se envió a ${target.name} sin imagen destacada.`,
                            metadata: { workflowId: fresh.id, workflowName: fresh.name, articleId: article.id, targetName: target.name }
                        });
                    }
                    await prisma.article.update({
                        where: { id: article.id },
                        data: { status: 'PUBLISHED' }
                    });
                } catch (err) {
                    console.error(`[CRON-PUBLISH] Publication failed for target ${target.name}:`, err);
                }
            }

            stats.articlesUnique = usedArticleIds.size;

            // Rotate the first medium on each run so a multi-medium workflow
            // does not always receive the newest notes first.
            const newCursor = sortedTargets.length === 0
                ? 0
                : (cursor + 1) % sortedTargets.length;
            await prisma.workflow.update({
                where: { id: workflow.id },
                data: { nextTargetIndex: newCursor }
            });

            let status: WorkflowRunStatus = 'SUCCESS';
            if (stats.targetsCovered === 0) status = 'ERROR';
            else if (stats.targetsCovered < stats.targetsTotal) status = 'PARTIAL';

            const parts: string[] = [`${stats.targetsCovered}/${stats.targetsTotal} publicaciones procesadas`];
            if (stats.articlesRefilled > 0) parts.push(`${stats.articlesRefilled} republicación(es)`);
            if (stats.targetsSkipped > 0) parts.push(`${stats.targetsSkipped} cupo(s) omitido(s) por falta de notas`);
            const summary = parts.join(' · ');

            console.log(`[CRON-PUBLISH] ${fresh.name}: ${summary}`);
            await this.recordRun(workflow.id, status, startedAt, stats, summary);
        } catch (error: any) {
            console.error(`[CRON-PUBLISH] Failed workflow ${fresh.name}:`, error);
            await this.recordRun(workflow.id, 'ERROR', startedAt, stats, error?.message || 'Error desconocido', error?.message);
        }
    }

    private buildPublicationSlots(workflow: any, targets: any[]): PublicationSlot[] {
        const limits = new Map<string, Map<string, number>>();
        for (const row of workflow.targetLimits || []) {
            if (!limits.has(row.targetId)) limits.set(row.targetId, new Map());
            limits.get(row.targetId)!.set(row.section || '', row.limit);
        }

        const slots: PublicationSlot[] = [];
        for (const target of targets) {
            const targetLimits = limits.get(target.id) || new Map<string, number>();
            const defaultLimit = targetLimits.get('') ?? 1;
            const overrides = [...targetLimits.entries()].filter(([section]) => section !== '');

            if (workflow.section) {
                const limit = targetLimits.get(workflow.section) ?? defaultLimit;
                for (let i = 0; i < limit; i++) {
                    slots.push({ target, section: workflow.section, excludedSections: new Set() });
                }
                continue;
            }

            const excludedSections = new Set(overrides.map(([section]) => section));
            for (const [section, limit] of overrides.sort(([a], [b]) => a.localeCompare(b))) {
                for (let i = 0; i < limit; i++) {
                    slots.push({ target, section, excludedSections: new Set() });
                }
            }
            for (let i = 0; i < defaultLimit; i++) {
                slots.push({ target, excludedSections });
            }
        }
        return slots;
    }

    private takeArticleForSlot(
        articles: Article[],
        slot: PublicationSlot,
        usedArticleIds: Set<string>,
        allowRepublish: boolean
    ): Article | null {
        const matches = (article: Article) => {
            if (slot.section && article.section !== slot.section) return false;
            if (!slot.section && slot.excludedSections.has(article.section || '')) return false;
            return true;
        };

        const unique = articles.find(article => !usedArticleIds.has(article.id) && matches(article));
        if (unique) return unique;
        if (!allowRepublish) return null;

        return articles.find(matches) || null;
    }

    /**
     * Produce a one-shot variant of an article for refill dispatching: fresh AI
     * rewrite + fresh image search, computed in-memory (not persisted). The
     * underlying Article row stays as it was after the first publish.
     */
    private async buildRepublishedVariant(article: Article): Promise<Article> {
        const rewritten = await this.aiService.rewriteContent(article.originalTitle, article.originalContent);

        const imageService = new ImageService();
        const { images: searchResults } = await imageService.searchImages({
            title: article.originalTitle,
            content: article.originalContent,
            rewrittenTitle: rewritten.title
        });

        const sourceDomain = this.extractDomain(article.originalUrl);
        const previousImage = article.featureImageUrl || article.originalImageUrl || '';
        const candidates = searchResults.filter(url => {
            if (this.extractDomain(url) === sourceDomain) return false;
            // Avoid reusing the same image that the first dispatch already sent.
            if (previousImage && url === previousImage) return false;
            return true;
        });

        const imageMinScore = await this.configService.getImageMinScore();
        let featureImageUrl: string | null = null;

        if (candidates.length > 0) {
            const result = await this.aiService.selectBestImage(
                article.originalTitle,
                article.originalContent,
                candidates,
                article.originalImageUrl || undefined,
                imageMinScore
            );
            if (result.url) featureImageUrl = result.url;
        }

        if (!featureImageUrl) {
            const generated = await imageService.generateImage(article.originalTitle);
            if (generated) featureImageUrl = generated;
        }

        if (!featureImageUrl) {
            // Last resort: the original image (better than no image at all).
            featureImageUrl = article.originalImageUrl ?? null;
        }

        return {
            ...article,
            rewrittenTitle: rewritten.title,
            rewrittenContent: rewritten.content,
            featureImageUrl
        };
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    }

    private async recordRun(
        workflowId: string,
        status: WorkflowRunStatus,
        startedAt: number,
        stats: RunStats,
        summary: string,
        errorMessage?: string
    ) {
        try {
            await prisma.workflowRun.create({
                data: {
                    workflowId,
                    status,
                    durationMs: Date.now() - startedAt,
                    targetsTotal: stats.targetsTotal,
                    targetsCovered: stats.targetsCovered,
                    targetsSkipped: stats.targetsSkipped,
                    articlesUnique: stats.articlesUnique,
                    articlesRefilled: stats.articlesRefilled,
                    summary,
                    errorMessage: errorMessage || null
                }
            });
        } catch (err) {
            console.error('[CRON-PUBLISH] Failed to persist WorkflowRun:', err);
        }

        // Notify only on non-success outcomes (per spec: no success spam).
        if (status === 'SUCCESS') return;

        try {
            const workflow = await prisma.workflow.findUnique({
                where: { id: workflowId },
                select: { name: true }
            });
            const workflowName = workflow?.name || workflowId;

            const level = status === 'ERROR' ? 'ERROR' : 'WARN';
            let title = '';
            let message = '';

            if (status === 'ERROR') {
                title = `${workflowName}: el flujo falló`;
                message = errorMessage || summary || 'Error durante la ejecución del flujo.';
            } else if (status === 'EMPTY') {
                title = `${workflowName}: sin publicaciones`;
                message = summary || 'No se publicó a ningún destino.';
            } else if (status === 'PARTIAL') {
                title = `${workflowName}: publicación parcial (${stats.targetsCovered}/${stats.targetsTotal})`;
                message = summary;
            }

            await notificationService.emit({
                level,
                source: 'WORKFLOW',
                title,
                message,
                metadata: {
                    workflowId,
                    workflowName,
                    status,
                    targetsCovered: stats.targetsCovered,
                    targetsTotal: stats.targetsTotal,
                    targetsSkipped: stats.targetsSkipped
                }
            });
        } catch (err) {
            console.error('[CRON-PUBLISH] Failed to emit workflow notification:', err);
        }
    }

    public unscheduleWorkflow(workflowId: string) {
        const jobId = `workflow_${workflowId}`;
        if (this.activeJobs.has(jobId)) {
            this.activeJobs.get(jobId)!.stop();
            this.activeJobs.delete(jobId);
            console.log(`Unscheduled workflow: ${workflowId}`);
        }
    }

    public stopAll() {
        for (const [id, task] of this.activeJobs.entries()) {
            task.stop();
        }
        this.activeJobs.clear();
    }
}
