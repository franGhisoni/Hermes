import { PrismaClient, Article } from '@prisma/client';

const prisma = new PrismaClient();

export class ArticleService {

    async findSimilarArticle(embedding: number[], threshold = 0.15): Promise<Article | null> {
        // pgvector uses <=> for cosine distance (lower is closer)
        // We need to query raw SQL because Prisma doesn't fully support vector ops in the typed API yet
        const vectorString = `[${embedding.join(',')}]`;

        const result = await prisma.$queryRaw`
      SELECT id, "originalTitle", "imageCandidates" FROM "Article"
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
        featureImageUrl?: string;
        imageCandidates?: string[];
        imageScores?: Record<string, number>;
        sourceId: string;
        section?: string;
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
                section: data.section,
                originalTitle: data.originalTitle,
                originalContent: data.originalContent,
                originalUrl: data.originalUrl,
                originalImageUrl: data.originalImageUrl,
                featureImageUrl: data.featureImageUrl,
                imageCandidates: data.imageCandidates || [],
                imageScores: data.imageScores || {},
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

    async getArticles(params: {
        page: number;
        limit: number;
        source?: string;
        section?: string;
        status?: string;
        sortBy?: 'date' | 'score';
        sortOrder?: 'desc' | 'asc';
    }) {
        const { page, limit, source, section, status, sortBy = 'date', sortOrder = 'desc' } = params;
        const skip = (page - 1) * limit;

        let where: any = {};
        if (source && source !== 'all') where.source = { name: source };
        if (section && section !== 'all') {
            where.section = { contains: section, mode: 'insensitive' };
        }
        if (status && status !== 'all') where.status = status as any;

        let orderBy: any = {};
        if (sortBy === 'date') orderBy = { createdAt: sortOrder };
        else if (sortBy === 'score') orderBy = { interestScore: sortOrder };

        const [items, total] = await Promise.all([
            prisma.article.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                include: { source: true }
            }),
            prisma.article.count({ where })
        ]);

        return {
            items,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }

    async getArticleById(id: string) {
        return prisma.article.findUnique({
            where: { id },
            include: { source: true }
        });
    }

    async findByUrl(url: string) {
        return prisma.article.findUnique({ where: { originalUrl: url } });
    }

    async addImageCandidate(articleId: string, imageUrl: string) {
        const article = await prisma.article.findUnique({ where: { id: articleId }, select: { imageCandidates: true } });
        if (!article) return;

        const current = article.imageCandidates || [];
        if (!current.includes(imageUrl)) {
            await prisma.article.update({
                where: { id: articleId },
                data: {
                    imageCandidates: [imageUrl, ...current]
                }
            });
        }
    }
}
