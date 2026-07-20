import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export class NAScraper extends BaseScraper {
    name = 'NA';
    baseUrl = 'https://noticiasargentinas.com';

    // Section landing pages expose only a curated subset. The category search
    // endpoint is the complete chronological feed and is therefore the right
    // source for scheduled ingestion. More sections can be added as their
    // category IDs are verified.
    private readonly categorySearchBySection: Record<string, string> = {
        politica: '65552e7fcb2fb1ac7bf231cd'
    };

    private getListingUrl(): string {
        const url = new URL(this.baseUrl);
        const section = url.pathname.split('/').filter(Boolean).pop()?.toLowerCase();
        const category = section ? this.categorySearchBySection[section] : undefined;
        return category ? `https://noticiasargentinas.com/search?category=${category}` : this.baseUrl;
    }

    // Override the entire scrape method to bypass Puppeteer and avoid Cloudflare blocks
    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        console.log(`[NA] Starting native fetch scrape for ${this.baseUrl} with limit ${limit}...`);

        const allArticles: ScrapedArticle[] = [];
        const seenUrls = new Set<string>();

        try {
            const urlObj = new URL(this.baseUrl);
            const requestedSection = urlObj.pathname.split('/').filter(Boolean).pop()?.toLowerCase();
            let sectionName = 'Portada';
            if (urlObj.pathname && urlObj.pathname !== '/') {
                const segment = urlObj.pathname.split('/').filter(p => p).pop() || 'Portada';
                sectionName = segment.charAt(0).toUpperCase() + segment.slice(1);
            }

            const listingUrl = this.getListingUrl();
            console.log(`[NA] Fetching section page: ${listingUrl}`);

            // NA started returning 403 for bot User-Agents (Googlebot/facebookexternalhit).
            // A real desktop Chrome UA is served normally (200), so use that instead.
            const fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
                }
            };

            const response = await fetch(listingUrl, fetchOptions);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log(`[NA] Section not found (404) for ${listingUrl}. Skipping.`);
                    return [];
                }
                throw new Error(`Failed to fetch section page: ${response.status} ${response.statusText}`);
            }

            const html = await response.text();
            console.log(`[NA-Debug] HTML length: ${html.length}`);
            const $ = cheerio.load(html);

            const links: string[] = [];

            $('a').each((_, el) => {
                const href = $(el).attr('href');
                if (!href) return;

                const fullUrl = href.startsWith('http') ? href : `https://noticiasargentinas.com${href}`;
                const normalizedUrl = new URL(fullUrl);
                // Story-mode links are alternate renderings of the same article and
                // otherwise bypass URL deduplication because of the query string.
                normalizedUrl.search = '';
                normalizedUrl.hash = '';
                const canonicalUrl = normalizedUrl.toString();

                // NA articles usually have /politica/, /economia/, etc.
                const belongsToRequestedSection = !requestedSection || canonicalUrl.includes(`/${requestedSection}/`);
                if (belongsToRequestedSection && (href.includes('/politica/') || href.includes('/economia/') || href.includes('/sociedad/') || href.includes('/deportes/') || href.includes('/internacional/') || href.includes('/internacionales/') || href.includes('/espectaculos/'))) {
                    if (href.length > 30 && !href.match(/\/(tag|tema|seccion)\//)) {
                        if (!seenUrls.has(canonicalUrl)) {
                            seenUrls.add(canonicalUrl);
                            links.push(canonicalUrl);
                        }
                    }
                }
            });

            console.log(`[NA] Found ${links.length} potential articles. Scraping up to ${limit}...`);
            this.recordCandidates(links.length);

            for (const link of links) {
                if (allArticles.length >= limit) break;

                try {
                    this.recordVisit();
                    console.log(`[NA] Fetching ${link}`);
                    const artRes = await fetch(link, fetchOptions);

                    if (!artRes.ok) {
                        this.recordFailure(new Error(`Article request returned ${artRes.status}`));
                        continue;
                    }
                    const artHtml = await artRes.text();
                    const $art = cheerio.load(artHtml);

                    const publishedAt = this.parseDateCandidates([
                        $art('meta[property="article:published_time"]').attr('content'),
                        $art('meta[itemprop="datePublished"]').attr('content'),
                        $art('time[datetime]').first().attr('datetime'),
                        this.jsonLdDatePublished($art('script[type="application/ld+json"]').map((_, s) => $art(s).text()).get())
                    ]);
                    if (!this.isFromToday(publishedAt)) {
                        this.recordDateSkip();
                        console.log(`[NA] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                        continue;
                    }

                    const title = $art('h1').first().text().trim() || $art('article h1').first().text().trim();

                    let content = '';
                    const pars = $art('article p');
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    if (pars.length > 1) {
                        const pTexts: string[] = [];
                        pars.each((_, p) => {
                            if ($art(p).closest(embedAncestor).length > 0) return;
                            pTexts.push($art(p).text().trim());
                        });
                        content = this.cleanParagraphs(pTexts).join('\n\n');
                    } else {
                        const raw = $art('.news-body').first().text().trim() ||
                            $art('.body').first().text().trim() || '';
                        const paragraphs = raw.split(/\n\s*\n+/).map(t => t.trim()).filter(t => t.length > 0);
                        content = this.cleanParagraphs(paragraphs).join('\n\n');
                    }

                    const image = $art('figure img').attr('src') || $art('article img').attr('src') || $art('meta[property="og:image"]').attr('content');

                    if (title && content) {
                        allArticles.push({
                            title,
                            content,
                            url: link,
                            imageUrl: image || undefined,
                            publishedAt: publishedAt ?? new Date(),
                            section: sectionName
                        });
                        this.recordAccepted();
                        console.log(`[NA] Success: ${title.substring(0, 30)}...`);
                    } else {
                        this.recordContentSkip();
                        console.log(`[NA-Debug] Skip: ${link}. Title?: ${!!title}, Content length: ${content.length}`);
                    }

                } catch (e) {
                    this.recordFailure(e);
                    console.error(`[NA] Error processing article ${link}:`, e);
                }
            }

            console.log(`[NA] Scraped total ${allArticles.length} unique articles via native fetch.`);
            return allArticles;

        } catch (error) {
            this.recordFailure(error);
            console.error(`[NA] Native fetch scrape failed:`, error);
            throw error;
        }
    }

    // Required by BaseScraper interface, but unused here
    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
