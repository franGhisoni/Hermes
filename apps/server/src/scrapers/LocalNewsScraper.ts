import * as cheerio from 'cheerio';
import { Page } from 'puppeteer';
import { BaseScraper, ScrapedArticle } from './BaseScraper';

type LocalNewsConfig = {
    name: string;
    baseUrl: string;
    articleUrl: (url: URL) => boolean;
    contentSelectors?: string[];
    excludedPathParts?: string[];
};

type Candidate = {
    url: string;
    title?: string;
};

const FETCH_OPTIONS: RequestInit = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
    }
};

const DEFAULT_CONTENT_SELECTORS = [
    'article .article-body p',
    'article .entry-content p',
    'article .post-body p',
    'article .news-body p',
    '.article-content p',
    '.article-body p',
    '.entry-content p',
    '.post-body p',
    '.news-body p',
    'main article p',
    'article p'
];

/**
 * Native-fetch scraper for local publishers with server-rendered HTML.
 * Individual publishers only provide their URL rules/selectors; date, JSON-LD,
 * diagnostics and content cleanup remain shared with the existing scrapers.
 */
export abstract class LocalNewsScraper extends BaseScraper {
    readonly config: LocalNewsConfig;

    name!: string;
    baseUrl!: string;

    constructor(config: LocalNewsConfig) {
        super();
        this.config = config;
        this.name = config.name;
        this.baseUrl = config.baseUrl;
    }

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        await this.loadScrapeSettings();

        const listingUrl = this.baseUrl;
        console.log(`[${this.name}] Starting native fetch scrape for ${listingUrl} with limit ${limit}...`);

        try {
            const candidates = await this.fetchCandidates(listingUrl);
            this.recordCandidates(candidates);

            const articles: ScrapedArticle[] = [];
            for (const candidate of candidates) {
                if (articles.length >= limit) break;

                try {
                    this.recordVisit(candidate.url, candidate.title);
                    const response = await fetch(candidate.url, FETCH_OPTIONS);
                    if (!response.ok) {
                        this.recordFailure(new Error(`Article request returned ${response.status}`), candidate.url, candidate.title);
                        continue;
                    }

                    const $ = cheerio.load(await response.text());
                    const jsonLd = this.extractNewsArticleJsonLd($);
                    const publishedAt = this.parseDateCandidates([
                        jsonLd?.datePublished,
                        $('meta[property="article:published_time"]').attr('content'),
                        $('meta[itemprop="datePublished"]').attr('content'),
                        $('meta[name="date"]').attr('content'),
                        $('meta[name="DC.date.issued"]').attr('content'),
                        $('time[datetime]').first().attr('datetime'),
                        this.jsonLdDatePublished($('script[type="application/ld+json"]')
                            .map((_, script) => $(script).text()).get()),
                        this.dateFromUrl(candidate.url)?.toISOString()
                    ]);
                    const title = this.htmlToText(
                        jsonLd?.headline ||
                        $('h1').first().text() ||
                        $('meta[property="og:title"]').attr('content') ||
                        candidate.title || ''
                    );

                    if (!this.isFromToday(publishedAt)) {
                        this.recordDateSkip(candidate.url, publishedAt, title);
                        continue;
                    }

                    const paragraphs = this.extractContentParagraphs($, jsonLd?.articleBody);
                    const content = this.cleanParagraphs(paragraphs).join('\n\n');
                    const imageUrl = this.resolveImageUrl(
                        this.jsonLdImage(jsonLd?.image) ||
                        $('meta[property="og:image"]').attr('content') ||
                        $('meta[name="twitter:image"]').attr('content') ||
                        $('article img').first().attr('src')
                    );

                    if (!title || !content) {
                        this.recordContentSkip(
                            candidate.url,
                            title,
                            `Contenido insuficiente: título ${title ? 'presente' : 'ausente'}, ${content.length} caracteres extraídos.`
                        );
                        continue;
                    }

                    articles.push({
                        title,
                        content,
                        url: candidate.url,
                        imageUrl,
                        publishedAt: publishedAt ?? new Date(),
                        section: this.sectionFromUrl(candidate.url)
                    });
                    this.recordAccepted(
                        candidate.url,
                        title,
                        publishedAt,
                        content.length,
                        'Fecha válida y cuerpo extraído desde la estructura HTML de la nota.'
                    );
                } catch (error) {
                    this.recordFailure(error, candidate.url, candidate.title);
                    console.error(`[${this.name}] Error processing ${candidate.url}:`, error);
                }
            }

            console.log(`[${this.name}] Scraped ${articles.length} valid articles.`);
            return articles;
        } catch (error) {
            this.recordFailure(error);
            console.error(`[${this.name}] Native fetch scrape failed:`, error);
            throw error;
        }
    }

    private async fetchCandidates(listingUrl: string): Promise<Candidate[]> {
        const response = await fetch(listingUrl, FETCH_OPTIONS);
        if (!response.ok) throw new Error(`Listing request returned ${response.status}`);

        const $ = cheerio.load(await response.text());
        const candidates: Candidate[] = [];
        const seen = new Set<string>();

        $('a[href]').each((_, anchor) => {
            const rawHref = $(anchor).attr('href');
            const url = this.normalizeArticleUrl(rawHref, listingUrl);
            if (!url || seen.has(url) || !this.isAllowedHost(url) || !this.config.articleUrl(new URL(url))) return;

            seen.add(url);
            const title = this.htmlToText($(anchor).text()) ||
                this.htmlToText($(anchor).attr('aria-label') || '') ||
                undefined;
            candidates.push({ url, title });
        });

        console.log(`[${this.name}] Found ${candidates.length} candidate articles on ${listingUrl}.`);
        return candidates;
    }

    private normalizeArticleUrl(rawUrl: string | undefined, listingUrl: string): string | null {
        if (!rawUrl || rawUrl.startsWith('#') || rawUrl.startsWith('javascript:')) return null;

        try {
            const url = new URL(rawUrl, listingUrl);
            if (!['http:', 'https:'].includes(url.protocol)) return null;
            url.protocol = 'https:';
            url.search = '';
            url.hash = '';
            url.pathname = url.pathname.replace(/\/amp\/?$/i, '/').replace(/\/\/+/, '/');
            return url.toString();
        } catch {
            return null;
        }
    }

    private isAllowedHost(url: string): boolean {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        const baseHostname = new URL(this.config.baseUrl).hostname.toLowerCase().replace(/^www\./, '');
        return hostname === baseHostname || hostname.endsWith(`.${baseHostname}`);
    }

    private extractContentParagraphs($: cheerio.CheerioAPI, articleBody?: unknown): string[] {
        const selectors = this.config.contentSelectors || DEFAULT_CONTENT_SELECTORS;
        for (const selector of selectors) {
            const paragraphs = $(selector)
                .toArray()
                .map(element => this.htmlToText($(element).text()))
                .filter(Boolean);
            if (paragraphs.length > 0) return paragraphs;
        }

        const fallback = this.htmlToText(typeof articleBody === 'string' ? articleBody : '');
        return fallback ? [fallback] : [];
    }

    private extractNewsArticleJsonLd($: cheerio.CheerioAPI): any | null {
        let article: any | null = null;
        $('script[type="application/ld+json"]').each((_, script) => {
            if (article) return;
            try {
                const json = JSON.parse($(script).text());
                const nodes = Array.isArray(json) ? json : (json?.['@graph'] || [json]);
                article = nodes.find((node: any) => {
                    const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
                    return types.includes('NewsArticle') || types.includes('Article') || types.includes('ReportageNewsArticle');
                }) || null;
            } catch {
                // Some publishers include non-JSON scripts or malformed JSON-LD.
            }
        });
        return article;
    }

    private jsonLdImage(image: any): string | undefined {
        if (typeof image === 'string') return image;
        if (Array.isArray(image)) return this.jsonLdImage(image[0]);
        return image?.url || image?.contentUrl;
    }

    private resolveImageUrl(rawUrl: string | undefined): string | undefined {
        if (!rawUrl) return undefined;
        try {
            return new URL(rawUrl, this.config.baseUrl).toString();
        } catch {
            return undefined;
        }
    }

    private sectionFromUrl(url: string): string {
        try {
            const firstSegment = new URL(url).pathname.split('/').filter(Boolean)[0];
            if (!firstSegment || /^\d{4}$/.test(firstSegment) || /^nota$/i.test(firstSegment)) return 'Portada';
            return firstSegment.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        } catch {
            return 'Portada';
        }
    }

    private htmlToText(value: string): string {
        return cheerio.load(`<body>${value || ''}</body>`)('body').text().replace(/\s+/g, ' ').trim();
    }

    protected async performScrape(_page: Page, _url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}

const hasArticleLikePath = (url: URL, excludedPathParts: string[] = []): boolean => {
    const path = url.pathname.toLowerCase();
    if (path === '/' || excludedPathParts.some(part => path.includes(part))) return false;
    const parts = path.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return parts.length >= 2 && last.length >= 8 && !/\.(?:jpg|jpeg|png|gif|webp|pdf|xml|css|js)$/i.test(last);
};

const config = (
    name: string,
    baseUrl: string,
    articleUrl: (url: URL) => boolean,
    contentSelectors?: string[],
    excludedPathParts?: string[]
): LocalNewsConfig => ({ name, baseUrl, articleUrl, contentSelectors, excludedPathParts });

export const LOCAL_NEWS_CONFIGS = {
    ElDiarioSur: config(
        'ElDiarioSur',
        'https://www.eldiariosur.com',
        url => /^\/[^/]+\/\d{4}\/\d{1,2}\/\d{1,2}\/[^/]+-\d+\.html\/?$/i.test(url.pathname)
    ),
    LaUnion: config(
        'LaUnion',
        'https://launion.com.ar',
        url => /^\/[^/]+\/[^/]+-n\d+(?:\/amp)?\/?$/i.test(url.pathname)
    ),
    DiarioConurbano: config(
        'DiarioConurbano',
        'https://diarioconurbano.com.ar',
        url => hasArticleLikePath(url, ['/wp-content/', '/contacto', '/quienes-somos', '/publicidad', '/tag/', '/categoria/'])
    ),
    ElTermometroWeb: config(
        'ElTermometroWeb',
        'https://eltermometroweb.com',
        url => hasArticleLikePath(url, ['/wp-content/', '/contacto', '/quienes-somos', '/author/', '/tag/', '/category/'])
    ),
    AvellanedaHoy: config(
        'AvellanedaHoy',
        'https://avellanedahoy.com.ar',
        url => /^\/nota\/\d+\/[^/]+\/?$/i.test(url.pathname),
        ['article .nota-contenido p', 'article .entry-content p', '.nota-contenido p', ...DEFAULT_CONTENT_SELECTORS]
    ),
    LaTeclaInfo: config(
        'LaTeclaInfo',
        'https://latecla.info',
        url => /^(?:\/(?:5\.0\/)?\d+-[^/]+|\/(?:5\.0\/)?nota\/\d+\/[^/]+)\/?$/i.test(url.pathname) ||
            hasArticleLikePath(url, ['/actualidad', '/nacionales', '/provincia', '/politica', '/economia', '/informes', '/contacto', '/suscripcion']),
        ['article .nota-texto p', 'article .article-body p', '.nota-texto p', ...DEFAULT_CONTENT_SELECTORS]
    ),
    Infocielo: config(
        'Infocielo',
        'https://www.infocielo.com',
        url => /^(?:\/politica|\/sociedad|\/deportes|\/economia|\/provincia|\/judiciales|\/policiales|\/la-plata|\/municipios)\/[^/]+\/?$/i.test(url.pathname),
        ['article .article-content p', 'article .content p', '.article-content p', ...DEFAULT_CONTENT_SELECTORS]
    ),
    LaPoliticaOnline: config(
        'LaPoliticaOnline',
        'https://www.lapoliticaonline.com',
        url => hasArticleLikePath(url, ['/files/', '/newsletter', '/suscribite', '/contacto', '/seccion/']),
        ['article .article-body p', 'article .article-content p', '.article-body p', ...DEFAULT_CONTENT_SELECTORS]
    ),
    LetraP: config(
        'LetraP',
        'https://www.letrap.com.ar',
        url => /^\/[^/]+\.html\/?$/i.test(url.pathname) ||
            hasArticleLikePath(url, ['/wp-content/', '/contacto', '/nosotros', '/tag/', '/categoria/']),
        ['article .article-body p', 'article .entry-content p', '.article-body p', ...DEFAULT_CONTENT_SELECTORS]
    ),
    LaDefensa: config(
        'LaDefensa',
        'https://www.ladefensadigital.com',
        url => /^\/\d{4}\/\d{2}\/[^/]+\.html\/?$/i.test(url.pathname),
        ['.post-body p', '.post-body', 'article p', ...DEFAULT_CONTENT_SELECTORS]
    )
} as const;
