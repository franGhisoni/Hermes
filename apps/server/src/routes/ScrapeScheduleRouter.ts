import { Router, Request, Response } from 'express';
import cron from 'node-cron';
import { requireAdmin, isDemoUser } from '../middlewares/auth';
import { SCRAPER_SOURCES } from '../services/QueueService';
import { prisma } from '../lib/prisma';
import { getDemoScrapeSchedules } from '../services/DemoService';

const router = Router();

// GET all scrape schedules
router.get('/', async (req: Request, res: Response) => {
    try {
        if (isDemoUser(req)) return res.json(getDemoScrapeSchedules());

        const schedules = await prisma.scrapeSchedule.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(schedules);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scrape schedules' });
    }
});

// Create schedules for every registered scraper that is still missing.
router.post('/bulk', requireAdmin, async (req: Request, res: Response) => {
    const requestedCron = req.body?.cron?.toString().trim();
    if (!requestedCron || !cron.validate(requestedCron)) {
        return res.status(400).json({ error: 'A valid cron expression is required' });
    }

    try {
        const existing = await prisma.scrapeSchedule.findMany({
            where: { source: { in: [...SCRAPER_SOURCES] } },
            select: { source: true }
        });
        const configuredSources = new Set(existing.map(schedule => schedule.source));
        const missingSources = SCRAPER_SOURCES.filter(source => !configuredSources.has(source));

        const created = missingSources.length > 0
            ? await prisma.$transaction(
                missingSources.map(source => prisma.scrapeSchedule.create({
                    data: { source, cron: requestedCron }
                }))
            )
            : [];

        const { schedulerService } = require('../index');
        if (schedulerService) {
            for (const schedule of created) {
                schedulerService.scheduleScrapeJob(schedule);
            }
        }

        res.status(created.length > 0 ? 201 : 200).json({
            created,
            skippedSources: SCRAPER_SOURCES.filter(source => configuredSources.has(source))
        });
    } catch (error) {
        console.error('Failed to create all scraper schedules:', error);
        res.status(500).json({ error: 'Failed to create scraper schedules' });
    }
});

// POST create a new scrape schedule
router.post('/', requireAdmin, async (req: Request, res: Response) => {
    const { source, cron } = req.body;
    if (!source || !cron) {
        return res.status(400).json({ error: 'source and cron are required' });
    }
    try {
        const schedule = await prisma.scrapeSchedule.create({
            data: { source, cron }
        });

        // Notify scheduler to pick up the new schedule
        const { schedulerService } = require('../index');
        if (schedulerService) {
            schedulerService.scheduleScrapeJob(schedule);
        }

        res.status(201).json(schedule);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create scrape schedule' });
    }
});

// PUT update a scrape schedule
router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
    const { source, cron, isActive } = req.body;
    try {
        const schedule = await prisma.scrapeSchedule.update({
            where: { id: req.params.id },
            data: { source, cron, isActive }
        });

        // Re-register with scheduler
        const { schedulerService } = require('../index');
        if (schedulerService) {
            if (schedule.isActive) {
                schedulerService.scheduleScrapeJob(schedule);
            } else {
                schedulerService.unscheduleScrapeJob(schedule.id);
            }
        }

        res.json(schedule);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update scrape schedule' });
    }
});

// DELETE a scrape schedule
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        // Unschedule first
        const { schedulerService } = require('../index');
        if (schedulerService) {
            schedulerService.unscheduleScrapeJob(req.params.id);
        }

        await prisma.scrapeSchedule.delete({ where: { id: req.params.id } });
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete scrape schedule' });
    }
});

export default router;
