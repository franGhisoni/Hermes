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

    // ---- Scraping & retention ----

    async getScrapeLimit(): Promise<number> {
        return this.getIntSetting('scrape_limit', 3);
    }

    async getArticleRetentionHours(): Promise<number> {
        return this.getIntSetting('article_retention_hours', 48);
    }

    async getArticleCleanupCron(): Promise<string> {
        return this.getSetting('article_cleanup_cron', '0 * * * *');
    }

    // ---- Image search ----

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

    async getImagePoolSize(): Promise<number> {
        return this.getIntSetting('image_pool_size', 30);
    }

    async getImageScoringMaxRetries(): Promise<number> {
        return this.getIntSetting('image_scoring_max_retries', 6);
    }

    async getImagePerQueryCap(): Promise<number> {
        return this.getIntSetting('image_per_query_cap', 3);
    }

    async getImageMinWidth(): Promise<number> {
        return this.getIntSetting('image_min_width', 400);
    }

    async getImageMinHeight(): Promise<number> {
        return this.getIntSetting('image_min_height', 300);
    }

    async getImageQueryContentChars(): Promise<number> {
        return this.getIntSetting('image_query_content_chars', 900);
    }

    async getImageQueryMinLength(): Promise<number> {
        return this.getIntSetting('image_query_min_length', 4);
    }

    async getImageQueryMaxCount(): Promise<number> {
        return this.getIntSetting('image_query_max_count', 6);
    }

    async getImageLeadMinChars(): Promise<number> {
        return this.getIntSetting('image_lead_min_chars', 20);
    }

    async getImageLeadMaxChars(): Promise<number> {
        return this.getIntSetting('image_lead_max_chars', 300);
    }

    async getImageLeadMaxWords(): Promise<number> {
        return this.getIntSetting('image_lead_max_words', 8);
    }

    async getImageSearchPageTimeoutMs(): Promise<number> {
        return this.getIntSetting('image_search_page_timeout_ms', 20000);
    }

    async getImageSearchSelectorTimeoutMs(): Promise<number> {
        return this.getIntSetting('image_search_selector_timeout_ms', 8000);
    }

    async getImageFetchTimeoutMs(): Promise<number> {
        return this.getIntSetting('image_fetch_timeout_ms', 10000);
    }

    async getImageEngineFailureThreshold(): Promise<number> {
        // After this many consecutive empty/blocked responses from the primary
        // image engine (Google), stop hitting it for the rest of the pipeline
        // and rely on Bing alone. Lower = give up sooner, higher = retry more.
        return this.getIntSetting('image_engine_failure_threshold', 2);
    }

    // ---- AI models ----

    async getEmbeddingModel(): Promise<string> {
        return this.getSetting('model_embedding', 'text-embedding-3-small');
    }

    async getRewriteModel(): Promise<string> {
        return this.getSetting('model_rewrite', 'gpt-4o-mini');
    }

    async getInterestModel(): Promise<string> {
        return this.getSetting('model_interest', 'gpt-4o-mini');
    }

    async getImageQueryModel(): Promise<string> {
        return this.getSetting('model_image_query', 'gpt-4o');
    }

    async getImageScoringModel(): Promise<string> {
        return this.getSetting('model_image_scoring', 'gpt-4o');
    }

    async getImageGenerationModel(): Promise<string> {
        return this.getSetting('model_image_generation', 'gpt-image-2');
    }

    // ---- AI tuning (tokens & content windows) ----

    async getRewriteMaxTokens(): Promise<number> {
        return this.getIntSetting('ai_rewrite_max_tokens', 1500);
    }

    async getRewriteContentChars(): Promise<number> {
        return this.getIntSetting('ai_rewrite_content_chars', 3000);
    }

    async getInterestMaxTokens(): Promise<number> {
        return this.getIntSetting('ai_interest_max_tokens', 3);
    }

    async getInterestContentChars(): Promise<number> {
        return this.getIntSetting('ai_interest_content_chars', 500);
    }

    async getImageQueryMaxTokens(): Promise<number> {
        return this.getIntSetting('ai_image_query_max_tokens', 500);
    }

    async getImageQueryGenContentChars(): Promise<number> {
        return this.getIntSetting('ai_image_query_content_chars', 1500);
    }

    async getImageScoringMaxTokens(): Promise<number> {
        return this.getIntSetting('ai_image_scoring_max_tokens', 2000);
    }

    async getImageScoringContentChars(): Promise<number> {
        return this.getIntSetting('ai_image_scoring_content_chars', 1200);
    }

    // ---- Article processing ----

    async getDedupThreshold(): Promise<number> {
        return this.getFloatSetting('dedup_threshold', 0.15);
    }

    async getEmbeddingTextChars(): Promise<number> {
        return this.getIntSetting('embedding_text_chars', 1000);
    }

    // ---- Workflow defaults ----

    async getDefaultArticleWindowHours(): Promise<number> {
        return this.getIntSetting('workflow_default_window_hours', 24);
    }

    // ---- helpers ----

    private async getIntSetting(key: string, defaultValue: number): Promise<number> {
        const val = await this.getSetting(key, defaultValue.toString());
        const parsed = parseInt(val, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    }

    private async getFloatSetting(key: string, defaultValue: number): Promise<number> {
        const val = await this.getSetting(key, defaultValue.toString());
        const parsed = parseFloat(val);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
    }
}
