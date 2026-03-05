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

        const processedArticles = [];

        for (const article of articles) {
            try {
                const savedArticle = await this.processSingleArticle(source.id, article);
                if (savedArticle) {
                    processedArticles.push(savedArticle);
                }
            } catch (error) {
                console.error(`[Processor] Error processing article ${article.title}:`, error);
            }
        }

        return processedArticles;
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
        const searchResults = await imageService.searchImages(article.title);

        // Extract source domain to filter out images from the same publication
        // (they likely have the same branding/overlays as the original)
        const sourceDomain = this.extractDomain(article.url);

        // Build candidate list: Start with original (if valid), then search results
        const uniqueCandidates = new Set<string>();
        if (article.imageUrl && article.imageUrl.startsWith('http')) {
            uniqueCandidates.add(article.imageUrl);
        }
        // Filter search results: exclude images from the same domain as the article
        searchResults
            .filter(url => {
                const imgDomain = this.extractDomain(url);
                return imgDomain !== sourceDomain;
            })
            .forEach(url => uniqueCandidates.add(url));

        imageCandidates = Array.from(uniqueCandidates);

        let imageScoresDict: Record<string, number> | undefined = undefined;

        // If we have candidates, let AI pick the best one
        if (imageCandidates.length > 0) {
            console.log(`[Processor] AI Selecting best image from ${imageCandidates.length} candidates...`);
            const bestImageResult = await this.aiService.selectBestImage(article.title, article.content, imageCandidates);

            if (bestImageResult.url) {
                featureImageUrl = bestImageResult.url;
                console.log(`[Processor] AI selected: ${featureImageUrl}`);
            } else {
                // AI rejected all candidates (text overlays, logos, etc.)
                // Fall through to DALL-E generation
                console.log(`[Processor] AI rejected all candidates. Falling back to DALL-E...`);
                const generated = await imageService.generateImage(article.title);
                if (generated) {
                    featureImageUrl = generated;
                    imageCandidates.push(generated);
                    bestImageResult.scores.push(10); // Assume DALL-E is 10
                }
            }

            // Create dictionary of scores
            imageScoresDict = {};
            imageCandidates.forEach((url, i) => {
                imageScoresDict![url] = bestImageResult.scores[i] || 0;
            });

        } else {
            // No candidates at all ? generate
            console.log(`[Processor] No images found. Generating...`);
            const generated = await imageService.generateImage(article.title);
            if (generated) {
                featureImageUrl = generated;
                imageCandidates.push(generated);
                imageScoresDict = { [generated]: 10 };
            }
        }

        // 6. Save
        const newArticle = await this.articleService.saveArticle({
            sourceId,
            section: article.section,
            originalTitle: article.title,
            originalContent: article.content,
            originalUrl: article.url,
            originalImageUrl: article.imageUrl,
            featureImageUrl: featureImageUrl,
            imageCandidates: imageCandidates,
            imageScores: imageScoresDict,
            embedding,
            rewrittenTitle: rewritten.title,
            rewrittenContent: rewritten.content,
            interestScore,
            status: 'PENDING'
        });

        console.log(`[Processor] ✅ Saved new article: ${rewritten.title}`);
        return newArticle;
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

    /**
     * Extract the domain from a URL (e.g. "https://www.clarin.com/foo" → "clarin.com")
     */
    private extractDomain(url: string): string {
        try {
            const hostname = new URL(url).hostname;
            // Remove 'www.' prefix for consistent comparison
            return hostname.replace(/^www\./, '');
        } catch {
            return '';
        }
    }
}
