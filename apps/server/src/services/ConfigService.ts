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
        const val = await this.getSetting('scrape_limit', '3');
        return parseInt(val, 10);
    }
}
