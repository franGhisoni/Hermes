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

    async getImageSearchQueryTemplate(): Promise<string> {
        return this.getSetting('image_search_query_template', '{{query}} foto noticia');
    }

    async getImageSearchUrlTemplate(): Promise<string> {
        return this.getSetting(
            'image_search_url_template',
            'https://www.bing.com/images/search?q={{q}}&qft=%2Bfilterui%3Aimagesize-large%2Bfilterui%3Aaspect-wide'
        );
    }

    async getImageMinScore(): Promise<number> {
        // Default 4: candidates that show the right context but aren't the
        // exact protagonist (5-6 in the scoring rubric) should make it through
        // to the editor rather than triggering a DALL-E fallback. The editor
        // can still override the pick from the candidate carousel.
        return this.getIntSetting('image_min_score', 4);
    }

    private async getIntSetting(key: string, defaultValue: number): Promise<number> {
        const val = await this.getSetting(key, defaultValue.toString());
        const parsed = parseInt(val, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    }
}
