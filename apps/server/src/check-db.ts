import 'dotenv/config';
import { prisma } from './lib/prisma';

async function main() {
    console.log("Checking DB...", process.env.DATABASE_URL);
    const count = await prisma.article.count();
    const articles = await prisma.article.findMany({
        take: 2,
        orderBy: { createdAt: 'desc' },
        select: {
            originalTitle: true,
            rewrittenTitle: true,
            interestScore: true,
            status: true
        }
    });

    console.log(`Total Articles in DB: ${count}`);
    console.log(JSON.stringify(articles, null, 2));
}

main();
