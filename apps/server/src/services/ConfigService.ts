import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ConfigService {
    async getSetting(key: string, defaultValue: string): Promise<string> {
        const setting = await prisma.systemSetting.findUnique({ where: { key } });
        return setting ? setting.value : defaultValue;
    }

    async setSetting(key: string, value: string) {
        return prisma.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
    }

    async getScrapeLimit(): Promise<number> {
        return this.getIntSetting('scrape_limit', 3);
    }

    async getArticleRetentionHours(): Promise<number> {
        return this.getIntSetting('article_retention_hours', 48);
    }

    async getArticleCleanupCron(): Promise<string> {
        return this.getSetting('article_cleanup_cron', '0 * * * *');
    }

    private async getIntSetting(key: string, defaultValue: number): Promise<number> {
        const val = await this.getSetting(key, defaultValue.toString());
        const parsed = parseInt(val, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    }
}
