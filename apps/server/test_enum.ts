import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: ['query'] });

async function main() {
    try {
        console.log("Checking DB enum types...");
        const result = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"PromptType"))::text AS enum_value;`;
        console.log("Enum values in public schema:", result);
        
        console.log("Testing findFirst...");
        const count = await prisma.promptConfig.count({ where: { type: 'IMAGE_SELECT' } });
        console.log("Count for IMAGE_SELECT:", count);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
