import { AIService } from './AIService';
import { ArticleService } from './ArticleService';
import { ScrapedArticle } from '../scrapers/BaseScraper';

export class ProcessorService {
    private aiService: AIService;
    private articleService: ArticleService;

    constructor() {
        this.aiService = new AIService();
        this.articleService = new ArticleService();
    }

    async processScrapedArticles(sourceName: string, articles: ScrapedArticle[]) {
        // Ensure source exists
        let source = await this.articleService.getSourceByName(sourceName);
        if (!source) {
            // Create default source if not exists
            source = await this.articleService.createSource(sourceName, articles[0]?.url || 'http://unknown');
        }

        console.log(`[Processor] Processing ${articles.length} articles from ${sourceName}...`);

        for (const article of articles) {
            try {
                await this.processSingleArticle(source.id, article);
            } catch (error) {
                console.error(`[Processor] Error processing article ${article.title}:`, error);
            }
        }
    }

    private async processSingleArticle(sourceId: string, article: ScrapedArticle) {
        console.log(`[Processor] Analyzing: ${article.title}`);

        // 1. Generate Embedding
        // Combine title and snippet of content for better vector representation
        const textToEmbed = `${article.title}\n\n${article.content.substring(0, 1000)}`;
        const embedding = await this.aiService.generateEmbedding(textToEmbed);

        // 2. Semantic Deduplication
        const duplicate = await this.articleService.findSimilarArticle(embedding);
        if (duplicate) {
            console.log(`[Processor] ⚠️ DUPLICATE DETECTED. Similar to: ${duplicate.originalTitle} (ID: ${duplicate.id})`);
            // Here we could add logic to just update the existing one or reference it
            return;
        }

        // 3. Calculate Interest
        const interestScore = await this.aiService.calculateInterestScore(article.title, article.content);
        console.log(`[Processor] Interest Score: ${interestScore}/10`);

        // 4. Rewrite Content (If interesting enough?)
        // For now, always rewrite
        console.log(`[Processor] Rewriting content...`);
        const rewritten = await this.aiService.rewriteContent(article.title, article.content);

        // 5. Save
        await this.articleService.saveArticle({
            sourceId,
            originalTitle: article.title,
            originalContent: article.content,
            originalUrl: article.url,
            originalImageUrl: article.imageUrl,
            embedding,
            rewrittenTitle: rewritten.title,
            rewrittenContent: rewritten.content,
            interestScore,
            status: 'PENDING'
        });

        console.log(`[Processor] ✅ Saved new article: ${rewritten.title}`);
    }
}
