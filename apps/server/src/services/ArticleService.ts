import { PrismaClient, Article } from '@prisma/client';

const prisma = new PrismaClient();

export class ArticleService {

    async findSimilarArticle(embedding: number[], threshold = 0.15): Promise<Article | null> {
        // pgvector uses <=> for cosine distance (lower is closer)
        // We need to query raw SQL because Prisma doesn't fully support vector ops in the typed API yet
        const vectorString = `[${embedding.join(',')}]`;

        const result = await prisma.$queryRaw`
      SELECT id, "originalTitle" FROM "Article"
      WHERE 1 - (embedding <=> ${vectorString}::vector) > ${1 - threshold}
      ORDER BY embedding <=> ${vectorString}::vector
      LIMIT 1;
    `;

        const articles = result as Article[];
        return articles.length > 0 ? articles[0] : null;
    }

    async deleteArticle(id: string) {
        return prisma.article.delete({ where: { id } });
    }

    async createSource(name: string, url: string) {
        return prisma.source.create({
            data: {
                name,
                url,
                scraperConfig: {},
                active: true
            }
        });
    }

    async getSourceByName(name: string) {
        return prisma.source.findFirst({ where: { name } });
    }

    async saveArticle(data: {
        originalTitle: string;
        originalContent: string;
        originalUrl: string;
        originalImageUrl?: string;
        sourceId: string;
        embedding: number[];
        rewrittenTitle?: string;
        rewrittenContent?: string;
        interestScore?: number;
        status?: 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
    }) {
        const vectorString = `[${data.embedding.join(',')}]`;

        // We insert raw to handle the vector field
        // Prisma Client Extension for vectors is cleaner, but this is robust for now
        const id = crypto.randomUUID();

        // 1. Create record without embedding first (Prisma typed)
        const article = await prisma.article.create({
            data: {
                id,
                sourceId: data.sourceId,
                originalTitle: data.originalTitle,
                originalContent: data.originalContent,
                originalUrl: data.originalUrl,
                originalImageUrl: data.originalImageUrl,
                rewrittenTitle: data.rewrittenTitle,
                rewrittenContent: data.rewrittenContent,
                interestScore: data.interestScore,
                status: data.status || 'PENDING',
                publishedAt: new Date(),
            }
        });

        // 2. Update with embedding using Raw SQL
        await prisma.$executeRaw`
        UPDATE "Article"
        SET embedding = ${vectorString}::vector
        WHERE id = ${id}
      `;

        return article;
    }

    async getAllArticles() {
        // Return raw query or typed if possible, but status is typed
        return prisma.article.findMany({
            orderBy: { createdAt: 'desc' },
            include: { source: true }
        });
    }

    async getArticleById(id: string) {
        return prisma.article.findUnique({
            where: { id },
            include: { source: true }
        });
    }
}
