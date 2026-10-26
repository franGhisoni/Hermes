import * as cheerio from 'cheerio';
import { Page } from 'puppeteer';
import { BaseScraper, ScrapedArticle } from './BaseScraper';

type Candidate = {
    url: string;
    title?: string;
};

/**
 * Shared flow for sites that serve their articles as plain HTML: read the section
 * listing, visit each article with fetch + cheerio and keep the ones from today.
 * A subclass only says what a article URL looks like and where the body lives.
 */
export abstract class FetchNewsScraper extends BaseScraper {
    /** Scheme and host, without a trailing slash (e.g. https://www.example.com). */
    protected abstract readonly origin: string;
    /** CSS selector of the element that holds the article body. */
    protected abstract readonly bodySelector: string;
    protected abstract isArticlePath(pathname: string): boolean;

    private readonly fetchOptions = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
        }
    };

    // Live blogs are a stream of short updates; they rewrite poorly.
    private static readonly LIVE_COVERAGE = /(^|-)vivo(-|$)|minuto-a-minuto|minuto-minuto/i;
    private static readonly READ_MORE = /^(lee|leé|leer|mirá|mira|seguí|segui|te puede interesar|más información|mas informacion|además|ver también)(?=[\s:,.-]|$).{0,80}$/i;

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        await this.loadScrapeSettings();

        const listing = new URL(this.baseUrl);
        const segment = listing.pathname.split('/').filter(Boolean).pop()?.replace(/\.\w+$/, '');
        const sectionName = segment ? this.capitalize(segment) : 'Portada';
        console.log(`[${this.name}] Starting ${sectionName} scrape with limit ${limit}...`);

        try {
            const candidates = await this.fetchCandidates(listing.toString());
            this.recordCandidates(candidates);

            const articles: ScrapedArticle[] = [];
            // Listings mix in older notes, so allow more visits than the limit.
            const maxVisits = limit * 6 + 10;
            let visits = 0;
            for (const candidate of candidates) {
                if (articles.length >= limit || visits >= maxVisits) break;
                visits++;

                try {
                    this.recordVisit(candidate.url, candidate.title);
                    const response = await fetch(candidate.url, this.fetchOptions);
                    if (!response.ok) {
                        this.recordFailure(new Error(`Article request returned ${response.status}`), candidate.url, candidate.title);
                        continue;
                    }

                    const $ = cheerio.load(await response.text());
                    const jsonLd = this.extractNewsArticleJsonLd($);
                    const publishedAt = this.parsePublishedAt([
                        jsonLd?.datePublished,
                        $('meta[property="article:published_time"]').attr('content'),
                        $('meta[itemprop="datePublished"]').attr('content'),
                        $('time[datetime]').first().attr('datetime')
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

                    // Some sites split the body across several blocks with the same class,
                    // and a nested match would repeat its paragraphs.
                    const rawParagraphs = [...new Set(
                        $(this.bodySelector)
                            .find('p, h2, h3')
                            .toArray()
                            .map(element => this.htmlToText($(element).text()))
                    )].filter(text => !FetchNewsScraper.READ_MORE.test(text));
                    const content = this.cleanParagraphs(rawParagraphs).join('\n\n');
                    const imageUrl = this.resolveUrl(
                        this.jsonLdImage(jsonLd?.image) || $('meta[property="og:image"]').attr('content')
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
                        section: sectionName
                    });
                    this.recordAccepted(
                        candidate.url,
                        title,
                        publishedAt,
                        content.length,
                        `Fecha válida y cuerpo extraído desde la nota de ${this.name}.`
                    );
                    console.log(`[${this.name}] Success: ${title.substring(0, 50)}...`);
                } catch (error) {
                    this.recordFailure(error, candidate.url, candidate.title);
                    console.error(`[${this.name}] Error processing ${candidate.url}:`, error);
                }
            }

            console.log(`[${this.name}] Scraped ${articles.length} valid articles from ${sectionName}.`);
            return articles;
        } catch (error) {
            this.recordFailure(error);
            console.error(`[${this.name}] Scrape failed:`, error);
            throw error;
        }
    }

    /** Dates in a non-ISO format can be handled by overriding this. */
    protected parseDate(raw: string): Date | null {
        const date = new Date(raw);
        return isNaN(date.getTime()) ? null : date;
    }

    private parsePublishedAt(candidates: Array<string | null | undefined>): Date | null {
        for (const raw of candidates) {
            if (!raw) continue;
            const date = this.parseDate(raw.trim());
            if (date) return date;
        }
        return null;
    }

    private async fetchCandidates(listingUrl: string): Promise<Candidate[]> {
        const response = await fetch(listingUrl, this.fetchOptions);
        if (!response.ok) throw new Error(`Section request returned ${response.status}`);

        const $ = cheerio.load(await response.text());
        const candidates: Candidate[] = [];
        const seen = new Set<string>();
        $('a[href]').each((_, anchor) => {
            const url = this.normalizeArticleUrl($(anchor).attr('href'));
            if (!url || seen.has(url)) return;
            seen.add(url);
            candidates.push({ url, title: this.htmlToText($(anchor).text()) || undefined });
        });
        console.log(`[${this.name}] Found ${candidates.length} candidates on ${listingUrl}.`);
        return candidates;
    }

    protected normalizeArticleUrl(rawUrl: string | undefined): string | null {
        if (!rawUrl) return null;
        try {
            const site = new URL(this.origin);
            const url = new URL(rawUrl, this.origin);
            const bareHost = (host: string) => host.replace(/^www\./, '');
            if (bareHost(url.hostname) !== bareHost(site.hostname)) return null;
            if (!this.isArticlePath(url.pathname)) return null;
            if (FetchNewsScraper.LIVE_COVERAGE.test(url.pathname)) return null;
            url.protocol = site.protocol;
            url.hostname = site.hostname;
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

    private resolveUrl(rawUrl: string | undefined): string | undefined {
        if (!rawUrl) return undefined;
        try {
            return new URL(rawUrl, this.origin).toString();
        } catch {
            return undefined;
        }
    }

    private capitalize(value: string): string {
        const text = value.replace(/-/g, ' ');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    protected async performScrape(_page: Page, _url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
