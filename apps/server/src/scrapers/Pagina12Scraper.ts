import * as cheerio from 'cheerio';
import { Page } from 'puppeteer';
import { BaseScraper, ScrapedArticle } from './BaseScraper';

type Candidate = {
    url: string;
    publishedAt?: Date;
    title?: string;
};

const SECTION_SLUGS: Record<string, string> = {
    politica: 'el-pais',
    economia: 'economia',
    sociedad: 'sociedad',
    deportes: 'deportes',
    espectaculos: 'cultura-y-espectaculos',
    cultura: 'cultura-y-espectaculos',
    internacional: 'el-mundo',
    internacionales: 'el-mundo'
};

const SECTION_NAMES: Record<string, string> = {
    'el-pais': 'Política',
    economia: 'Economía',
    sociedad: 'Sociedad',
    deportes: 'Deportes',
    'cultura-y-espectaculos': 'Espectáculos',
    'el-mundo': 'Internacional'
};

export class Pagina12Scraper extends BaseScraper {
    name = 'Pagina12';
    baseUrl = 'https://www.pagina12.com.ar';

    private readonly fetchOptions = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
        }
    };

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        const requestedSegment = new URL(this.baseUrl).pathname.split('/').filter(Boolean).pop()?.toLowerCase();
        const sectionSlug = requestedSegment ? (SECTION_SLUGS[requestedSegment] || requestedSegment) : null;
        const sectionName = sectionSlug ? (SECTION_NAMES[sectionSlug] || this.capitalize(sectionSlug)) : 'Portada';

        console.log(`[Pagina12] Starting ${sectionName} scrape with limit ${limit}...`);

        try {
            const candidates = await this.fetchCandidates(sectionSlug);
            this.recordCandidates(candidates);

            const articles: ScrapedArticle[] = [];
            for (const candidate of candidates) {
                if (articles.length >= limit) break;

                try {
                    this.recordVisit(candidate.url, candidate.title);
                    const response = await fetch(candidate.url, this.fetchOptions);
                    if (!response.ok) {
                        this.recordFailure(new Error(`Article request returned ${response.status}`), candidate.url, candidate.title);
                        continue;
                    }

                    const html = await response.text();
                    const $ = cheerio.load(html);
                    const fusion = this.extractFusionGlobalContent($('#fusion-metadata').text());
                    const jsonLd = this.extractNewsArticleJsonLd($);
                    const publishedAt = this.parseDateCandidates([
                        jsonLd?.datePublished,
                        $('time[datetime]').first().attr('datetime'),
                        fusion?.publish_date,
                        candidate.publishedAt?.toISOString()
                    ]);

                    const title = this.htmlToText(
                        jsonLd?.headline ||
                        $('h1.p12Heading').first().text() ||
                        $('h1').first().text() ||
                        fusion?.headlines?.basic ||
                        candidate.title || ''
                    );

                    if (!this.isFromToday(publishedAt)) {
                        this.recordDateSkip(candidate.url, publishedAt, title);
                        console.log(`[Pagina12] Skipping non-current article (${publishedAt!.toISOString()}): ${candidate.url}`);
                        continue;
                    }

                    const paragraphs = this.extractContentParagraphs(fusion?.content_elements || []);
                    const content = this.cleanParagraphs(paragraphs).join('\n\n');
                    const image = this.resolveImageUrl(
                        this.jsonLdImage(jsonLd?.image) ||
                        $('meta[property="og:image"]').attr('content') ||
                        $('.p12-lead-art__image-wrapper img').first().attr('src') ||
                        fusion?.promo_items?.basic?.url
                    );

                    if (!title || !content) {
                        this.recordContentSkip(
                            candidate.url,
                            title,
                            `Contenido insuficiente: título ${title ? 'presente' : 'ausente'}, ${content.length} caracteres extraídos de Fusion.`
                        );
                        continue;
                    }

                    articles.push({
                        title,
                        content,
                        url: candidate.url,
                        imageUrl: image,
                        publishedAt: publishedAt ?? candidate.publishedAt ?? new Date(),
                        section: sectionName
                    });
                    this.recordAccepted(
                        candidate.url,
                        title,
                        publishedAt,
                        content.length,
                        'Fecha válida y cuerpo extraído desde Fusion.globalContent.'
                    );
                    console.log(`[Pagina12] Success: ${title.substring(0, 50)}...`);
                } catch (error) {
                    this.recordFailure(error, candidate.url, candidate.title);
                    console.error(`[Pagina12] Error processing ${candidate.url}:`, error);
                }
            }

            console.log(`[Pagina12] Scraped ${articles.length} valid articles from ${sectionName}.`);
            return articles;
        } catch (error) {
            this.recordFailure(error);
            console.error('[Pagina12] Scrape failed:', error);
            throw error;
        }
    }

    private async fetchCandidates(sectionSlug: string | null): Promise<Candidate[]> {
        if (sectionSlug) {
            const rssUrl = `https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/${sectionSlug}/notas`;
            const response = await fetch(rssUrl, this.fetchOptions);
            if (response.ok) {
                const xml = await response.text();
                const $rss = cheerio.load(xml, { xmlMode: true });
                const candidates: Candidate[] = [];
                const seen = new Set<string>();

                $rss('item').each((_, item) => {
                    const rawUrl = $rss(item).find('link').first().text().trim();
                    const url = this.normalizeArticleUrl(rawUrl);
                    if (!url || seen.has(url)) return;
                    seen.add(url);
                    candidates.push({
                        url,
                        title: this.htmlToText($rss(item).find('title').first().text()),
                        publishedAt: this.parseDateCandidates([$rss(item).find('pubDate').first().text()]) || undefined
                    });
                });

                if (candidates.length > 0) {
                    console.log(`[Pagina12] Found ${candidates.length} candidates in ${sectionSlug} RSS.`);
                    return candidates;
                }
            } else {
                console.warn(`[Pagina12] RSS returned ${response.status}; falling back to the section page.`);
            }
        }

        const listingUrl = sectionSlug
            ? `https://www.pagina12.com.ar/${sectionSlug}/`
            : 'https://www.pagina12.com.ar/';
        const response = await fetch(listingUrl, this.fetchOptions);
        if (!response.ok) throw new Error(`Section request returned ${response.status}`);

        const $ = cheerio.load(await response.text());
        const candidates: Candidate[] = [];
        const seen = new Set<string>();
        $('a[href]').each((_, anchor) => {
            const rawUrl = $(anchor).attr('href');
            const url = this.normalizeArticleUrl(rawUrl);
            if (!url || seen.has(url)) return;
            seen.add(url);
            candidates.push({ url, title: this.htmlToText($(anchor).text()) || undefined });
        });
        console.log(`[Pagina12] Found ${candidates.length} candidates on ${listingUrl}.`);
        return candidates;
    }

    private normalizeArticleUrl(rawUrl: string | undefined): string | null {
        if (!rawUrl) return null;
        try {
            const url = new URL(rawUrl, 'https://www.pagina12.com.ar');
            if (!/^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/.test(url.pathname)) return null;
            url.protocol = 'https:';
            url.hostname = 'www.pagina12.com.ar';
            url.search = '';
            url.hash = '';
            return url.toString();
        } catch {
            return null;
        }
    }

    private extractFusionGlobalContent(script: string): any | null {
        const marker = 'Fusion.globalContent=';
        const markerIndex = script.indexOf(marker);
        if (markerIndex < 0) return null;
        const start = script.indexOf('{', markerIndex + marker.length);
        if (start < 0) return null;

        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < script.length; index++) {
            const char = script[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') inString = true;
            else if (char === '{') depth++;
            else if (char === '}' && --depth === 0) {
                try {
                    return JSON.parse(script.slice(start, index + 1));
                } catch {
                    return null;
                }
            }
        }
        return null;
    }

    private extractNewsArticleJsonLd($: cheerio.CheerioAPI): any | null {
        let article: any | null = null;
        $('script[type="application/ld+json"]').each((_, script) => {
            if (article) return;
            try {
                const json = JSON.parse($(script).text());
                const nodes = Array.isArray(json) ? json : (json['@graph'] || [json]);
                article = nodes.find((node: any) => {
                    const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
                    return types.includes('NewsArticle') || types.includes('Article');
                }) || null;
            } catch {
                // Try the next JSON-LD block.
            }
        });
        return article;
    }

    private extractContentParagraphs(elements: any[]): string[] {
        const paragraphs: string[] = [];
        const visit = (node: any) => {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach(visit);
                return;
            }
            if (node.type === 'oembed_response' || node.type === 'image' || node.type === 'video') return;
            if ((node.type === 'text' || node.type === 'header') && typeof node.content === 'string') {
                const text = this.htmlToText(node.content);
                if (text) paragraphs.push(text);
            }
            if (node.content_elements) visit(node.content_elements);
            if (node.items) visit(node.items);
            if (node.children) visit(node.children);
        };
        visit(elements);
        return paragraphs;
    }

    private htmlToText(value: string): string {
        if (!value) return '';
        return cheerio.load(`<body>${value}</body>`)('body').text().replace(/\s+/g, ' ').trim();
    }

    private jsonLdImage(image: any): string | undefined {
        if (typeof image === 'string') return image;
        if (Array.isArray(image)) return this.jsonLdImage(image[0]);
        return image?.url || image?.contentUrl;
    }

    private resolveImageUrl(rawUrl: string | undefined): string | undefined {
        if (!rawUrl) return undefined;
        try {
            return new URL(rawUrl, 'https://www.pagina12.com.ar').toString();
        } catch {
            return undefined;
        }
    }

    private capitalize(value: string): string {
        return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
    }

    protected async performScrape(_page: Page, _url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
