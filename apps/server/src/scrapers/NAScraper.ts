import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export class NAScraper extends BaseScraper {
    name = 'NA';
    baseUrl = 'https://noticiasargentinas.com';

    // Override the entire scrape method to bypass Puppeteer and avoid Cloudflare blocks
    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        console.log(`[NA] Starting native fetch scrape for ${this.baseUrl} with limit ${limit}...`);

        const allArticles: ScrapedArticle[] = [];
        const seenUrls = new Set<string>();

        try {
            const urlObj = new URL(this.baseUrl);
            let sectionName = 'Portada';
            if (urlObj.pathname && urlObj.pathname !== '/') {
                const segment = urlObj.pathname.split('/').filter(p => p).pop() || 'Portada';
                sectionName = segment.charAt(0).toUpperCase() + segment.slice(1);
            }

            console.log(`[NA] Fetching section page: ${this.baseUrl}`);

            const fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                }
            };

            const response = await fetch(this.baseUrl, fetchOptions);

            if (!response.ok) {
                if (response.status === 404) {
                    console.log(`[NA] Section not found (404) for ${this.baseUrl}. Skipping.`);
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

                // NA articles usually have /politica/, /economia/, etc.
                if (href.includes('/politica/') || href.includes('/economia/') || href.includes('/sociedad/') || href.includes('/deportes/') || href.includes('/internacional/') || href.includes('/espectaculos/')) {
                    if (href.length > 30 && !href.match(/\/(tag|tema|seccion)\//)) {
                        if (!seenUrls.has(fullUrl)) {
                            seenUrls.add(fullUrl);
                            links.push(fullUrl);
                        }
                    }
                }
            });

            console.log(`[NA] Found ${links.length} potential articles. Scraping up to ${limit}...`);

            for (const link of links) {
                if (allArticles.length >= limit) break;

                try {
                    console.log(`[NA] Fetching ${link}`);
                    const artRes = await fetch(link, fetchOptions);

                    if (!artRes.ok) continue;
                    const artHtml = await artRes.text();
                    const $art = cheerio.load(artHtml);

                    const title = $art('h1').first().text().trim() || $art('article h1').first().text().trim();

                    let content = '';
                    const pars = $art('article p');
                    if (pars.length > 1) {
                        const pTexts: string[] = [];
                        pars.each((_, p) => { pTexts.push($art(p).text().trim()); });
                        content = pTexts.join('\n\n');
                    } else {
                        content = $art('.news-body').first().text().trim() ||
                            $art('.body').first().text().trim() || '';
                    }

                    const image = $art('figure img').attr('src') || $art('article img').attr('src') || $art('meta[property="og:image"]').attr('content');

                    if (title && content) {
                        allArticles.push({
                            title,
                            content,
                            url: link,
                            imageUrl: image || undefined,
                            publishedAt: new Date(),
                            section: sectionName
                        });
                        console.log(`[NA] Success: ${title.substring(0, 30)}...`);
                    } else {
                        console.log(`[NA-Debug] Skip: ${link}. Title?: ${!!title}, Content length: ${content.length}`);
                    }

                } catch (e) {
                    console.error(`[NA] Error processing article ${link}:`, e);
                }
            }

            console.log(`[NA] Scraped total ${allArticles.length} unique articles via native fetch.`);
            return allArticles;

        } catch (error) {
            console.error(`[NA] Native fetch scrape failed:`, error);
            throw error;
        }
    }

    // Required by BaseScraper interface, but unused here
    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
