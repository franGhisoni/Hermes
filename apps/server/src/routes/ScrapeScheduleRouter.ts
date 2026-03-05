import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET all scrape schedules
router.get('/', async (req: Request, res: Response) => {
    try {
        const schedules = await prisma.scrapeSchedule.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(schedules);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch scrape schedules' });
    }
});

// POST create a new scrape schedule
router.post('/', async (req: Request, res: Response) => {
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
router.put('/:id', async (req: Request, res: Response) => {
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
router.delete('/:id', async (req: Request, res: Response) => {
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
