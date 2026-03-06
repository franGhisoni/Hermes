import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export class ClarinScraper extends BaseScraper {
    name = 'Clarin';
    baseUrl = 'https://www.clarin.com';

    // Override the entire scrape method to bypass Puppeteer and avoid Cloudflare blocks
    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        console.log(`[Clarin] Starting native fetch scrape for ${this.baseUrl} with limit ${limit}...`);

        const allArticles: ScrapedArticle[] = [];
        const seenUrls = new Set<string>();

        try {
            const response = await fetch(this.baseUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.baseUrl}: ${response.status} ${response.statusText}`);
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            const links: string[] = [];
            $('a').each((_, el) => {
                const href = $(el).attr('href');
                if (!href) return;
                // Exclude videos, fotogalerias, etc.
                if (href.includes('.html') && !href.includes('/videos/') && !href.includes('/fotogalerias/')) {
                    const fullUrl = href.startsWith('http') ? href : `https://www.clarin.com${href}`;
                    if (!seenUrls.has(fullUrl)) {
                        seenUrls.add(fullUrl);
                        links.push(fullUrl);
                    }
                }
            });

            console.log(`[Clarin] Found ${links.length} potential articles. Scraping up to ${limit}...`);

            // Determine section based on current baseUrl
            const urlPath = new URL(this.baseUrl).pathname;
            let sectionName = 'Portada';
            if (urlPath && urlPath !== '/') {
                const segment = urlPath.split('/').filter(p => p).pop() || 'Portada';
                sectionName = segment.charAt(0).toUpperCase() + segment.slice(1);
            }

            for (const link of links) {
                if (allArticles.length >= limit) break;

                try {
                    console.log(`[Clarin] Fetching ${link}`);
                    const artRes = await fetch(link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    if (!artRes.ok) continue;
                    const artHtml = await artRes.text();
                    const $art = cheerio.load(artHtml);

                    const title = $art('h1').first().text().trim() ||
                        $art('.title').first().text().trim() ||
                        $art('article h1').first().text().trim();

                    let content = '';
                    const bodySelectors = ['.body-nota', '.body-article', 'article', '.content-nota', '.entry-content', 'div[class*="body"]'];

                    for (const sel of bodySelectors) {
                        const pars = $art(`${sel} p`);
                        if (pars.length > 2) {
                            const pTexts: string[] = [];
                            pars.each((_, p) => { pTexts.push($art(p).text().trim()); });
                            content = pTexts.join('\n\n');
                            break;
                        }
                    }

                    const image = $art('picture img').attr('src') ||
                        $art('article img').attr('src') ||
                        $art('meta[property="og:image"]').attr('content');

                    if (title && content) {
                        allArticles.push({
                            title,
                            content,
                            url: link,
                            imageUrl: image || undefined,
                            publishedAt: new Date(),
                            section: sectionName
                        });
                        console.log(`[Clarin] Success: ${title.substring(0, 30)}...`);
                    } else {
                        console.log(`[Clarin-Debug] Skip: ${link}. Title?: ${!!title}, Content length: ${content.length}`);
                    }

                } catch (e) {
                    console.error(`[Clarin] Error processing article ${link}:`, e);
                }
            }

            console.log(`[Clarin] Scraped total ${allArticles.length} unique articles natively.`);
            return allArticles;

        } catch (error) {
            console.error(`[Clarin] Native fetch scrape failed:`, error);
            throw error;
        }
    }

    // Required by BaseScraper interface, but unused here
    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
