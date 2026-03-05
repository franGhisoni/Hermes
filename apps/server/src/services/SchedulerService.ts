import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { QueueService } from './QueueService';
import { MailService } from './MailService';
import { ArticleService } from './ArticleService';

const prisma = new PrismaClient();

export class SchedulerService {
    private queueService: QueueService;
    private mailService: MailService;
    private articleService: ArticleService;
    private activeJobs: Map<string, ScheduledTask> = new Map();

    constructor(queueService: QueueService, articleService: ArticleService) {
        this.queueService = queueService;
        this.articleService = articleService;
        this.mailService = new MailService();
    }

    public async initialize() {
        console.log('Initializing Scheduler Service...');
        this.stopAll();

        try {
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
                include: { target: true }
            });
            for (const workflow of workflows) {
                this.scheduleWorkflow(workflow);
            }
            console.log(`Registered ${workflows.length} active publish workflows.`);
        } catch (error) {
            console.error('Failed to load schedules:', error);
        }
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
                // Scrape all configured sections for this source
                const sections = await prisma.section.findMany();

                if (sections.length === 0) {
                    await this.queueService.addScrapeJob(schedule.source, undefined, 3);
                } else {
                    for (const section of sections) {
                        await this.queueService.addScrapeJob(schedule.source, section.path, 3);
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
            console.log(`[CRON-PUBLISH] Executing workflow: ${workflow.name}`);
            try {
                // Find recent PENDING articles (last 24h), optionally filtered by section
                const where: any = {
                    status: 'PENDING',
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                };
                if (workflow.section) {
                    where.section = workflow.section;
                }

                const articles = await prisma.article.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    take: 10
                });

                if (articles.length === 0) {
                    console.log(`[CRON-PUBLISH] No new articles for workflow: ${workflow.name}`);
                    return;
                }

                // Send each article to the target
                const target = workflow.target;
                if (!target) return;

                for (const article of articles) {
                    const category = workflow.targetCategory || article.section || undefined;
                    await this.mailService.sendArticleToTarget(target.email, article as any, category);

                    // Mark as published
                    await prisma.article.update({
                        where: { id: article.id },
                        data: { status: 'PUBLISHED' }
                    });
                }

                console.log(`[CRON-PUBLISH] Published ${articles.length} articles to ${target.name}`);
            } catch (error) {
                console.error(`[CRON-PUBLISH] Failed workflow ${workflow.name}:`, error);
            }
        });

        this.activeJobs.set(jobId, task);
        console.log(`Scheduled workflow: ${workflow.name} -> ${workflow.target?.name || 'unknown'} [${workflow.cron}]`);
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
