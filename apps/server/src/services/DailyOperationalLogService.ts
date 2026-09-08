import { ScrapeRunStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

type ScrapeDiagnosticsLike = {
    candidatesDetected?: number;
    skippedByDate?: number;
    skippedByContent?: number;
    requestFailures?: number;
    processing?: {
        duplicateUrl?: number;
        duplicateSemantic?: number;
        failures?: number;
    };
};

function operationalDay(now = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const value = (part: string) => parts.find(item => item.type === part)?.value;
    return new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00.000Z`);
}

export class DailyOperationalLogService {
    async recordScrapeRun(input: {
        status: ScrapeRunStatus;
        scrapedCount: number;
        processedCount: number;
        diagnostics?: ScrapeDiagnosticsLike;
    }): Promise<void> {
        const diagnostics = input.diagnostics || {};
        const processing = diagnostics.processing || {};
        const discardedCount = (diagnostics.skippedByDate || 0)
            + (diagnostics.skippedByContent || 0)
            + (processing.duplicateUrl || 0)
            + (processing.duplicateSemantic || 0);
        const failedCount = (diagnostics.requestFailures || 0)
            + (processing.failures || 0)
            + (input.status === ScrapeRunStatus.ERROR ? 1 : 0);

        const day = operationalDay();
        await prisma.dailyOperationalLog.upsert({
            where: { day },
            create: {
                day,
                scrapeRuns: 1,
                candidatesDetected: diagnostics.candidatesDetected || 0,
                scrapedCount: input.scrapedCount,
                processedCount: input.processedCount,
                discardedCount,
                failedCount
            },
            update: {
                scrapeRuns: { increment: 1 },
                candidatesDetected: { increment: diagnostics.candidatesDetected || 0 },
                scrapedCount: { increment: input.scrapedCount },
                processedCount: { increment: input.processedCount },
                discardedCount: { increment: discardedCount },
                failedCount: { increment: failedCount }
            }
        });
    }

    async recordPublication(success: boolean): Promise<void> {
        const field = success ? 'publishedCount' : 'publishFailedCount';
        const day = operationalDay();
        await prisma.dailyOperationalLog.upsert({
            where: { day },
            create: { day, [field]: 1 },
            update: { [field]: { increment: 1 } }
        });
    }
}

export const dailyOperationalLogService = new DailyOperationalLogService();
