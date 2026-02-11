import { AIService } from './AIService';
import { ArticleService } from './ArticleService';
import { ScrapedArticle } from '../scrapers/BaseScraper';
import { ImageService } from './ImageService';

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

        // 0. Pre-check: Duplicate URL
        const existing = await this.articleService.findByUrl(article.url);
        if (existing) {
            console.log(`[Processor] ⏭️ Article already exists (URL match). Skipping: ${article.title}`);
            return;
        }

        // 1. Generate Embedding
        const textToEmbed = `${article.title}\n\n${article.content.substring(0, 1000)}`;
        const embedding = await this.aiService.generateEmbedding(textToEmbed);

        // 2. Semantic Deduplication
        const duplicate = await this.articleService.findSimilarArticle(embedding);
        if (duplicate) {
            // Refined Check: Even if semantically similar, check for factual differences (dates, numbers)
            if (this.areTitlesFactuallyDifferent(article.title, duplicate.originalTitle)) {
                console.log(`[Processor] 🛡️ False positive detected (Factual Mismatch). Treating as new article.`);
                // Do NOT return. Fall through to process as new.
            } else {
                console.log(`[Processor] ⚠️ DUPLICATE DETECTED. Similar to: ${duplicate.originalTitle} (ID: ${duplicate.id})`);

                // Image Harvesting Strategy:
                if (article.imageUrl) {
                    console.log(`[Processor] 📸 Harvesting image from duplicate...`);
                    await this.articleService.addImageCandidate(duplicate.id, article.imageUrl);
                }
                return;
            }
        }

        // 3. Calculate Interest
        const interestScore = await this.aiService.calculateInterestScore(article.title, article.content);
        console.log(`[Processor] Interest Score: ${interestScore}/10`);

        // 4. Rewrite Content
        console.log(`[Processor] Rewriting content...`);
        const rewritten = await this.aiService.rewriteContent(article.title, article.content);

        // 5. Image Strategy
        let featureImageUrl = article.imageUrl;
        let imageCandidates: string[] = [];

        // Always gather candidates to give AI a choice, even if original exists
        const imageService = new ImageService();
        // searchImages returns promise of string[]
        const searchResults = await imageService.searchImages(article.title);

        // Build candidate list: Start with original (if valid), then search results
        const uniqueCandidates = new Set<string>();
        if (article.imageUrl && article.imageUrl.startsWith('http')) {
            uniqueCandidates.add(article.imageUrl);
        }
        searchResults.forEach(url => uniqueCandidates.add(url));

        imageCandidates = Array.from(uniqueCandidates);

        // If we have candidates, let AI pick the best one
        if (imageCandidates.length > 0) {
            console.log(`[Processor] AI Selecting best image from ${imageCandidates.length} candidates...`);
            const bestImage = await this.aiService.selectBestImage(article.title, article.content, imageCandidates);

            if (bestImage) {
                featureImageUrl = bestImage;
                console.log(`[Processor] AI selected: ${featureImageUrl}`);
            } else {
                featureImageUrl = imageCandidates[0]; // Fallback
            }
        } else {
            // Fallback generation if absolutely no images found
            console.log(`[Processor] No images found. Generating...`);
            const generated = await imageService.generateImage(article.title);
            if (generated) {
                featureImageUrl = generated;
                imageCandidates.push(generated);
            }
        }

        // 6. Save
        await this.articleService.saveArticle({
            sourceId,
            section: article.section,
            originalTitle: article.title,
            originalContent: article.content,
            originalUrl: article.url,
            originalImageUrl: article.imageUrl,
            featureImageUrl: featureImageUrl,
            embedding,
            rewrittenTitle: rewritten.title,
            rewrittenContent: rewritten.content,
            interestScore,
            status: 'PENDING'
        });

        console.log(`[Processor] ✅ Saved new article: ${rewritten.title}`);
    }

    private areTitlesFactuallyDifferent(titleA: string, titleB: string): boolean {
        // Extract numbers from both titles
        const numsA = titleA.match(/\d+/g) || [];
        const numsB = titleB.match(/\d+/g) || [];

        // If no numbers, we trust semantic search
        if (numsA.length === 0 && numsB.length === 0) return false;

        // If sets of numbers are different, assume factual difference
        const setA = new Set(numsA);
        const setB = new Set(numsB);

        for (const num of numsA) {
            if (!setB.has(num)) return true;
        }
        for (const num of numsB) {
            if (!setA.has(num)) return true;
        }

        return false;
    }
}
