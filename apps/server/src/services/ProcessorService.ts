import { AIService } from './AIService';
import { ArticleService } from './ArticleService';
import { ScrapedArticle } from '../scrapers/BaseScraper';
import { ImageService } from './ImageService';
import { ConfigService } from './ConfigService';

export class ProcessorService {
    private aiService: AIService;
    private articleService: ArticleService;
    private configService: ConfigService;

    constructor() {
        this.aiService = new AIService();
        this.articleService = new ArticleService();
        this.configService = new ConfigService();
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
        // Original image is treated as last resort — it often has text overlays,
        // branding, or watermarks from the source publication.
        let featureImageUrl: string | undefined = undefined;
        let imageCandidates: string[] = [];
        let imageScoresDict: Record<string, number> | undefined = undefined;

        const imageService = new ImageService();

        // Smart query pass: gpt-4o sees article + original image and produces
        // search queries that target the actual protagonist (especially useful
        // for pun titles like "Soy urólogo, no ufólogo" where the regex extractor
        // searches the joke instead of the show/host).
        const smartQueries = await this.aiService.generateImageSearchQueries({
            title: article.title,
            content: article.content,
            rewrittenTitle: rewritten.title,
            originalImageUrl: article.imageUrl
        });

        const searchResults = await imageService.searchImages({
            title: article.title,
            content: article.content,
            rewrittenTitle: rewritten.title,
            smartQueries
        });

        // Extract source domain to filter out images from the same publication
        const sourceDomain = this.extractDomain(article.url);
        const normalizedOriginal = (article.imageUrl || '').trim();

        // Build candidates from search results only — exclude:
        //   1. Images from the same domain as the article (source branding/CDN)
        //   2. Byte-for-byte duplicates of the original URL (republishing the
        //      source's photo verbatim is forbidden; the AI scorer also rejects
        //      visual duplicates as a second line of defense).
        const searchCandidates = searchResults.filter(url => {
            if (normalizedOriginal && url.trim() === normalizedOriginal) return false;
            const imgDomain = this.extractDomain(url);
            return imgDomain !== sourceDomain;
        });

        const imageMinScore = await this.configService.getImageMinScore();

        if (searchCandidates.length > 0) {
            console.log(`[Processor] AI Selecting best image from ${searchCandidates.length} search candidates (min score: ${imageMinScore})...`);
            const bestImageResult = await this.aiService.selectBestImage(article.title, article.content, searchCandidates, article.imageUrl, imageMinScore);

            // Map every scored search candidate to its score BEFORE we touch
            // the array. The AI only evaluates the first N (see selectBestImage),
            // so positions beyond scores.length get 0.
            imageCandidates = [...searchCandidates];
            imageScoresDict = {};
            searchCandidates.forEach((url, i) => {
                imageScoresDict![url] = bestImageResult.scores[i] ?? 0;
            });

            if (bestImageResult.url) {
                featureImageUrl = bestImageResult.url;
                console.log(`[Processor] AI selected: ${featureImageUrl}`);
            } else {
                // AI rejected all search candidates → try DALL-E. Push the
                // generated URL into the candidate list AND its score dict
                // explicitly (the old code pushed onto scores[] which mis-aligned
                // it against searchCandidates, giving a random search result
                // the 10/10 and leaving the generated image at 0/10).
                console.log(`[Processor] AI rejected all search candidates. Falling back to DALL-E...`);
                const generated = await imageService.generateImage(article.title);
                if (generated) {
                    featureImageUrl = generated;
                    imageCandidates.push(generated);
                    imageScoresDict[generated] = 10;
                }
            }

        } else {
            // No search results → try DALL-E directly
            console.log(`[Processor] No search results. Generating via DALL-E...`);
            const generated = await imageService.generateImage(article.title);
            if (generated) {
                featureImageUrl = generated;
                imageCandidates = [generated];
                imageScoresDict = { [generated]: 10 };
            }
        }

        // Always append original at the end of candidates so editor can access it,
        // but score it low (2) to signal it's a fallback option
        if (article.imageUrl && article.imageUrl.startsWith('http') && !imageCandidates.includes(article.imageUrl)) {
            imageCandidates.push(article.imageUrl);
            if (!imageScoresDict) imageScoresDict = {};
            imageScoresDict[article.imageUrl] = 2;
        }

        // Absolute last resort: if every strategy failed, use original
        if (!featureImageUrl && article.imageUrl) {
            featureImageUrl = article.imageUrl;
            console.log(`[Processor] ⚠️ All strategies failed. Using original as last resort.`);
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
