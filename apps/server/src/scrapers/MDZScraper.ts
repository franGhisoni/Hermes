import * as cheerio from 'cheerio';
import { Page } from 'puppeteer';
import { BaseScraper, ScrapedArticle } from './BaseScraper';

type Candidate = {
    url: string;
    publishedAt?: Date;
    title?: string;
    imageUrl?: string;
};

type SectionConfig = {
    feed: string;
    path: string;
    name: string;
};

const DEFAULT_SECTION: SectionConfig = {
    feed: 'noticias',
    path: 'ultimas-noticias',
    name: 'Portada'
};

const SECTIONS: Record<string, SectionConfig> = {
    'ultimo-momento': DEFAULT_SECTION,
    'ultimas-noticias': DEFAULT_SECTION,
    politica: { feed: 'politica', path: 'politica', name: 'Política' },
    economia: { feed: 'dinero', path: 'dinero', name: 'Economía' },
    dinero: { feed: 'dinero', path: 'dinero', name: 'Economía' },
    sociedad: { feed: 'sociedad', path: 'sociedad', name: 'Sociedad' },
    deportes: { feed: 'deportes', path: 'deportes', name: 'Deportes' },
    espectaculos: { feed: 'mdz-show', path: 'mdz-show', name: 'Espectáculos' },
    cultura: { feed: 'mdz-show', path: 'mdz-show', name: 'Espectáculos' },
    'mdz-show': { feed: 'mdz-show', path: 'mdz-show', name: 'Espectáculos' },
    internacional: { feed: 'mundo', path: 'mundo', name: 'Internacional' },
    internacionales: { feed: 'mundo', path: 'mundo', name: 'Internacional' },
    mundo: { feed: 'mundo', path: 'mundo', name: 'Internacional' }
};

export class MDZScraper extends BaseScraper {
    name = 'MDZ';
    baseUrl = 'https://www.mdzol.com';

    private readonly fetchOptions = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
        }
    };

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        await this.loadScrapeSettings();

        const requestedSegment = new URL(this.baseUrl).pathname
            .split('/')
            .filter(Boolean)
            .pop()
            ?.toLowerCase();
        const section = requestedSegment ? (SECTIONS[requestedSegment] || {
            feed: requestedSegment,
            path: requestedSegment,
            name: this.capitalize(requestedSegment)
        }) : DEFAULT_SECTION;

        console.log(`[MDZ] Starting ${section.name} scrape with limit ${limit}...`);

        try {
            const candidates = await this.fetchCandidates(section);
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

                    const $ = cheerio.load(await response.text());
                    const jsonLd = this.extractNewsArticleJsonLd($);
                    const publishedAt = this.parseDateCandidates([
                        jsonLd?.datePublished,
                        $('meta[property="article:published_time"]').attr('content'),
                        $('meta[itemprop="datePublished"]').attr('content'),
                        $('time[datetime]').first().attr('datetime'),
                        candidate.publishedAt?.toISOString()
                    ]);
                    const title = this.htmlToText(
                        jsonLd?.headline ||
                        $('h1').first().text() ||
                        $('meta[property="og:title"]').attr('content') ||
                        candidate.title || ''
                    );

                    if (!this.isFromToday(publishedAt)) {
                        this.recordDateSkip(candidate.url, publishedAt, title);
                        console.log(`[MDZ] Skipping non-current article (${publishedAt!.toISOString()}): ${candidate.url}`);
                        continue;
                    }

                    const domParagraphs = $('.news-detail__body')
                        .find('p, h2, h3, li')
                        .toArray()
                        .map(element => this.htmlToText($(element).text()));
                    const rawParagraphs = domParagraphs.length > 0
                        ? domParagraphs
                        : [this.htmlToText(jsonLd?.articleBody || '')];
                    const content = this.cleanParagraphs(rawParagraphs).join('\n\n');
                    const imageUrl = this.resolveImageUrl(
                        this.jsonLdImage(jsonLd?.image) ||
                        $('meta[property="og:image"]').attr('content') ||
                        candidate.imageUrl
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
                        publishedAt: publishedAt ?? candidate.publishedAt ?? new Date(),
                        section: section.name
                    });
                    this.recordAccepted(
                        candidate.url,
                        title,
                        publishedAt,
                        content.length,
                        'Fecha válida y cuerpo extraído desde la estructura de la nota de MDZ.'
                    );
                    console.log(`[MDZ] Success: ${title.substring(0, 50)}...`);
                } catch (error) {
                    this.recordFailure(error, candidate.url, candidate.title);
                    console.error(`[MDZ] Error processing ${candidate.url}:`, error);
                }
            }

            console.log(`[MDZ] Scraped ${articles.length} valid articles from ${section.name}.`);
            return articles;
        } catch (error) {
            this.recordFailure(error);
            console.error('[MDZ] Scrape failed:', error);
            throw error;
        }
    }

    private async fetchCandidates(section: SectionConfig): Promise<Candidate[]> {
        const rssUrl = `https://www.mdzol.com/rss/pages/${section.feed}.xml`;
        const response = await fetch(rssUrl, this.fetchOptions);
        if (response.ok) {
            const $rss = cheerio.load(await response.text(), { xmlMode: true });
            const candidates: Candidate[] = [];
            const seen = new Set<string>();

            $rss('item').each((_, item) => {
                const url = this.normalizeArticleUrl($rss(item).find('link').first().text().trim());
                if (!url || seen.has(url)) return;
                seen.add(url);
                candidates.push({
                    url,
                    title: this.htmlToText($rss(item).find('title').first().text()),
                    publishedAt: this.parseDateCandidates([$rss(item).find('pubDate').first().text()]) || undefined,
                    imageUrl: $rss(item).find('enclosure').first().attr('url')
                });
            });

            if (candidates.length > 0) {
                console.log(`[MDZ] Found ${candidates.length} candidates in ${section.feed} RSS.`);
                return candidates;
            }
            console.warn(`[MDZ] RSS ${rssUrl} had no usable items; falling back to the section page.`);
        } else {
            console.warn(`[MDZ] RSS returned ${response.status}; falling back to the section page.`);
        }

        const listingUrl = `https://www.mdzol.com/${section.path}`;
        const listingResponse = await fetch(listingUrl, this.fetchOptions);
        if (!listingResponse.ok) throw new Error(`Section request returned ${listingResponse.status}`);

        const $ = cheerio.load(await listingResponse.text());
        const candidates: Candidate[] = [];
        const seen = new Set<string>();
        $('a[href]').each((_, anchor) => {
            const url = this.normalizeArticleUrl($(anchor).attr('href'));
            if (!url || seen.has(url)) return;
            seen.add(url);
            candidates.push({ url, title: this.htmlToText($(anchor).text()) || undefined });
        });
        console.log(`[MDZ] Found ${candidates.length} candidates on ${listingUrl}.`);
        return candidates;
    }

    private normalizeArticleUrl(rawUrl: string | undefined): string | null {
        if (!rawUrl) return null;
        try {
            const url = new URL(rawUrl, 'https://www.mdzol.com');
            if (url.hostname !== 'www.mdzol.com' && url.hostname !== 'mdzol.com') return null;
            if (!/^\/[^/]+\/[^/]+-n\d+\/?$/.test(url.pathname)) return null;
            url.protocol = 'https:';
            url.hostname = 'www.mdzol.com';
            url.search = '';
            url.hash = '';
            return url.toString();
        } catch {
            return null;
        }
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
            return new URL(rawUrl, 'https://www.mdzol.com').toString();
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
