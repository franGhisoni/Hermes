import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export class TNScraper extends BaseScraper {
    name = 'TN';
    baseUrl = 'https://tn.com.ar';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        const resolvedUrl = this.resolveSectionUrl(url);
        console.log(`[TN] Navigating to ${resolvedUrl}`);
        await page.goto(resolvedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        let articleLinks = await page.evaluate((currentUrl) => {
            const seen = new Set<string>();
            const links: string[] = [];
            const requestedSection = new URL(currentUrl).pathname.split('/').filter(Boolean)[0];
            const isGeneralListing = !requestedSection || requestedSection === 'ultimas-noticias';

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                let fullUrl: string;
                try {
                    fullUrl = new URL(href, 'https://tn.com.ar').toString();
                } catch {
                    return;
                }

                const parsed = new URL(fullUrl);
                if (parsed.hostname !== 'tn.com.ar') return;
                const match = parsed.pathname.match(/^\/([^/]+)\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/);
                if (!match) return;
                if (!isGeneralListing && match[1] !== requestedSection) return;

                if (!seen.has(fullUrl)) {
                    seen.add(fullUrl);
                    links.push(fullUrl);
                }
            });
            return links; // BaseScraper handles limit
        }, resolvedUrl);

        if (articleLinks.length === 0) {
            console.warn(`[TN] Browser found no links; retrying listing discovery with fetch: ${resolvedUrl}`);
            articleLinks = await this.fetchListingLinks(resolvedUrl);
        }

        const articles: ScrapedArticle[] = [];
        this.recordCandidates(articleLinks);

        for (const link of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[TN] Visiting ${link}`);
            try {
                this.recordVisit(link);
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const publishedAt = await this.extractPublishedDate(page) ?? this.dateFromUrl(link);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip(link, publishedAt);
                    console.log(`[TN] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText ||
                        (document.querySelector('.article__title') as HTMLElement)?.innerText || '';

                    // TN often uses these classes
                    const contentElement = document.querySelector('.article-content') ||
                        document.querySelector('.cuerpo-nota') ||
                        document.querySelector('.article__body') ||
                        document.querySelector('article .content');

                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    let paragraphs: string[] = [];
                    if (contentElement) {
                        const pEls = contentElement.querySelectorAll('p');
                        if (pEls.length > 0) {
                            paragraphs = Array.from(pEls)
                                .filter(p => !(p as HTMLElement).closest(embedAncestor))
                                .map(p => (p as HTMLElement).innerText.trim())
                                .filter(t => t.length > 0);
                        } else {
                            // Fallback to innerText split by blank lines
                            paragraphs = ((contentElement as HTMLElement).innerText || '')
                                .split(/\n\s*\n+/)
                                .map(t => t.trim())
                                .filter(t => t.length > 0);
                        }
                    }

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.article-main-media img')?.getAttribute('src') ||
                        document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                    return { title, paragraphs, image };
                });

                const content = this.cleanParagraphs(data.paragraphs).join('\n\n');
                if (data.title && content) {
                    articles.push({
                        title: data.title,
                        content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: publishedAt ?? new Date()
                    });
                    this.recordAccepted(link, data.title, publishedAt, content.length);
                    console.log(`[TN] Success: ${data.title.substring(0, 30)}...`);
                } else this.recordContentSkip(link, data.title, `Contenido insuficiente: ${content.length} caracteres extraídos.`);
            } catch (e) {
                this.recordFailure(e, link);
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }

    private resolveSectionUrl(url: string): string {
        const parsed = new URL(url);
        if (parsed.pathname.replace(/\/+$/, '') === '/ultimo-momento') {
            parsed.pathname = '/ultimas-noticias/';
        }
        return parsed.toString();
    }

    private async fetchListingLinks(url: string): Promise<string[]> {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
            }
        });
        if (!response.ok) throw new Error(`Listing fallback returned ${response.status}`);

        const $ = cheerio.load(await response.text());
        const requestedSection = new URL(url).pathname.split('/').filter(Boolean)[0];
        const isGeneralListing = !requestedSection || requestedSection === 'ultimas-noticias';
        const seen = new Set<string>();
        const links: string[] = [];

        $('a[href]').each((_, anchor) => {
            const href = $(anchor).attr('href');
            if (!href) return;

            let parsed: URL;
            try {
                parsed = new URL(href, 'https://tn.com.ar');
            } catch {
                return;
            }
            if (parsed.hostname !== 'tn.com.ar') return;

            const match = parsed.pathname.match(/^\/([^/]+)\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/);
            if (!match || (!isGeneralListing && match[1] !== requestedSection)) return;

            const fullUrl = parsed.toString();
            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);
            links.push(fullUrl);
        });

        console.log(`[TN] Found ${links.length} links with native listing fetch.`);
        return links;
    }
}
