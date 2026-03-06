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
            // Determine the RSS URL based on the requested section
            const urlObj = new URL(this.baseUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            const sectionSegment = pathSegments.length > 0 ? pathSegments.pop() : 'lo-ultimo';
            let rssSection = sectionSegment === 'ultimo-momento' ? 'lo-ultimo' : sectionSegment;
            // Ensure we use the correct RSS structure
            const rssUrl = `https://www.clarin.com/rss/${rssSection}/`;

            console.log(`[Clarin] Fetching RSS feed: ${rssUrl}`);

            const fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                }
            };

            // Native fetch with Googlebot UA completely bypasses Cloudflare Datacenter IP blocks
            let response = await fetch(rssUrl, fetchOptions);

            if (!response.ok) {
                // If RSS fails for a specific sub-section, fallback to "lo-ultimo"
                console.warn(`[Clarin] Warning: RSS feed ${rssUrl} returned ${response.status}. Falling back to lo-ultimo.`);
                if (rssUrl !== 'https://www.clarin.com/rss/lo-ultimo/') {
                    const fallbackRes = await fetch('https://www.clarin.com/rss/lo-ultimo/', fetchOptions);
                    if (fallbackRes.ok) {
                        Object.defineProperty(response, 'text', { value: () => fallbackRes.text() });
                        Object.defineProperty(response, 'ok', { value: true });
                    } else {
                        throw new Error(`Failed to fetch fallback RSS feed: ${fallbackRes.status}`);
                    }
                } else {
                    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
                }
            }

            const xml = await response.text();

            // Simple regex extraction for RSS items (faster and perfectly valid for standard RSS)
            const links: string[] = [];
            const linkRegex = /<link>(https:\/\/www\.clarin\.com\/[^<]+\.html.*?)<\/link>/g;
            let match;
            while ((match = linkRegex.exec(xml)) !== null) {
                const url = match[1].replace('<![CDATA[', '').replace(']]>', '').trim();
                // Exclude videos, fotogalerias
                if (!url.includes('/videos/') && !url.includes('/fotogalerias/')) {
                    if (!seenUrls.has(url)) {
                        seenUrls.add(url);
                        links.push(url);
                    }
                }
            }

            console.log(`[Clarin] Found ${links.length} potential articles from RSS. Scraping up to ${limit}...`);

            // Determine section based on current baseUrl
            let sectionName = 'Portada';
            if (urlObj.pathname && urlObj.pathname !== '/') {
                const segment = urlObj.pathname.split('/').filter(p => p).pop() || 'Portada';
                sectionName = segment.charAt(0).toUpperCase() + segment.slice(1);
            }

            for (const link of links) {
                if (allArticles.length >= limit) break;

                try {
                    console.log(`[Clarin] Fetching ${link}`);
                    const artRes = await fetch(link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
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

            console.log(`[Clarin] Scraped total ${allArticles.length} unique articles via RSS + gotScraping.`);
            return allArticles;

        } catch (error) {
            console.error(`[Clarin] RSS feed scrape failed:`, error);
            throw error;
        }
    }

    // Required by BaseScraper interface, but unused here
    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
