import { prisma } from '../lib/prisma';

export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export class ConfigService {
    async getSettingsSnapshot(): Promise<Record<string, string>> {
        const envValue = Number.parseInt(process.env.SCRAPER_WORKER_CONCURRENCY || '', 10);
        const workerDefault = Number.isFinite(envValue) && envValue > 0
            ? Math.min(envValue, 8)
            : 4;

        const defaults: Record<string, string> = {
            scrape_limit: '3',
            scrape_only_today: 'true',
            scraper_worker_concurrency: workerDefault.toString(),
            article_retention_hours: '48',
            article_cleanup_cron: '0 * * * *',
            image_min_score: '4',
            image_pool_size: '30',
            image_scoring_max_retries: '6',
            image_per_query_cap: '3',
            image_min_width: '400',
            image_min_height: '300',
            image_query_content_chars: '900',
            image_query_min_length: '4',
            image_query_max_count: '6',
            image_lead_min_chars: '20',
            image_lead_max_chars: '300',
            image_lead_max_words: '8',
            image_fetch_timeout_ms: '10000',
            model_embedding: 'text-embedding-3-small',
            model_rewrite: 'gpt-4o-mini',
            model_interest: 'gpt-4o-mini',
            model_image_query: 'gpt-4o',
            model_image_scoring: 'gpt-4o',
            model_image_generation: 'gpt-image-2',
            ai_image_scoring_reasoning_effort: 'medium',
            ai_rewrite_max_tokens: '1500',
            ai_rewrite_content_chars: '3000',
            ai_interest_max_tokens: '3',
            ai_interest_content_chars: '500',
            ai_image_query_max_tokens: '500',
            ai_image_query_content_chars: '1500',
            ai_image_scoring_max_tokens: '2000',
            ai_image_scoring_content_chars: '1200',
            dedup_threshold: '0.15',
            embedding_text_chars: '1000',
            workflow_default_window_hours: '24',
            vorknews_publish_mode: 'DRAFT',
            vorknews_default_author: 'Juan Bautista Vega',
            vorknews_default_section_id: '64'
        };

        const rows = await prisma.systemSetting.findMany({
            select: { key: true, value: true }
        });
        for (const row of rows) defaults[row.key] = row.value;
        return defaults;
    }

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

    async getScrapeOnlyToday(): Promise<boolean> {
        return this.getBooleanSetting('scrape_only_today', true);
    }

    async getScraperWorkerConcurrency(): Promise<number> {
        const envValue = Number.parseInt(process.env.SCRAPER_WORKER_CONCURRENCY || '', 10);
        const envDefault = Number.isFinite(envValue) && envValue > 0
            ? Math.min(envValue, 8)
            : 4;
        const configured = await this.getIntSetting('scraper_worker_concurrency', envDefault);
        return Math.min(Math.max(configured, 1), 8);
    }

    async getArticleRetentionHours(): Promise<number> {
        return this.getIntSetting('article_retention_hours', 48);
    }

    async getArticleCleanupCron(): Promise<string> {
        return this.getSetting('article_cleanup_cron', '0 * * * *');
    }

    // ---- Image search ----

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

    async getImageFetchTimeoutMs(): Promise<number> {
        return this.getIntSetting('image_fetch_timeout_ms', 10000);
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

    async getImageScoringReasoningEffort(): Promise<ReasoningEffort> {
        const value = await this.getSetting('ai_image_scoring_reasoning_effort', 'medium');
        return (REASONING_EFFORTS as readonly string[]).includes(value)
            ? value as ReasoningEffort
            : 'medium';
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

    // ---- Vorknews CMS Settings ----

    async getVorknewsPublishMode(): Promise<'DRAFT' | 'PUBLISHED'> {
        const val = (await this.getSetting('vorknews_publish_mode', 'DRAFT')).toUpperCase();
        return val === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    }

    async getVorknewsDefaultAuthor(): Promise<string> {
        return this.getSetting('vorknews_default_author', 'Juan Bautista Vega');
    }

    async getVorknewsDefaultSectionId(): Promise<string> {
        return this.getSetting('vorknews_default_section_id', '64');
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

    private async getBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
        const val = (await this.getSetting(key, defaultValue.toString())).trim().toLowerCase();
        if (val === 'true') return true;
        if (val === 'false') return false;
        return defaultValue;
    }
}
