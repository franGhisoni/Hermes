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
            // Determine the requested section from the baseUrl path
            const urlObj = new URL(this.baseUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            const sectionSegment = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'lo-ultimo';

            const fetchOptions = {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            };

            const addLink = (rawUrl: string): void => {
                const url = rawUrl.replace('<![CDATA[', '').replace(']]>', '').trim();
                // Exclude videos, fotogalerias and repetitive SEO "cotización" pages
                // (foreign-country dollar quotes, daily currency listings) that the
                // user flagged as irrelevant noise for an Argentine audience.
                if (url.includes('/videos/') || url.includes('/fotogalerias/')) return;
                if (this.isQuoteFiller(url)) return;
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    links.push(url);
                }
            };

            const links: string[] = [];

            // Primary source: the section's HTML landing page. Unlike the RSS feed
            // (which for /economia is dominated by auto-generated "dólar hoy en <país>"
            // and daily-quote SEO pages), the landing page lists the section's real,
            // editorially-curated articles. The social-crawler UA still bypasses the
            // Cloudflare datacenter-IP block that pushed us to RSS originally.
            let htmlOk = false;
            try {
                const sectionUrl = `https://www.clarin.com/${sectionSegment}/`;
                console.log(`[Clarin] Fetching section page: ${sectionUrl}`);
                const secRes = await fetch(sectionUrl, fetchOptions);
                if (secRes.ok) {
                    const $sec = cheerio.load(await secRes.text());
                    $sec('a').each((_, el) => {
                        let href = $sec(el).attr('href');
                        if (!href) return;
                        if (!href.startsWith('http')) href = `https://www.clarin.com${href}`;
                        // Keep only real article links within the requested section
                        const re = new RegExp(`^https://www\\.clarin\\.com/${sectionSegment}/.+\\.html`);
                        if (re.test(href)) addLink(href);
                    });
                    htmlOk = links.length > 0;
                    console.log(`[Clarin] Found ${links.length} relevant articles from section page.`);
                } else {
                    console.warn(`[Clarin] Section page returned ${secRes.status}. Falling back to RSS.`);
                }
            } catch (e) {
                console.warn(`[Clarin] Section page fetch failed, falling back to RSS:`, e);
            }

            // Fallback source: RSS feed (with a further fallback to "lo-ultimo").
            if (!htmlOk) {
                const rssSection = sectionSegment === 'ultimo-momento' ? 'lo-ultimo' : sectionSegment;
                const rssUrl = `https://www.clarin.com/rss/${rssSection}/`;
                console.log(`[Clarin] Fetching RSS feed: ${rssUrl}`);

                let response = await fetch(rssUrl, fetchOptions);
                if (!response.ok) {
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
                const linkRegex = /<link>(https:\/\/www\.clarin\.com\/[^<]+\.html.*?)<\/link>/g;
                let match;
                while ((match = linkRegex.exec(xml)) !== null) {
                    addLink(match[1]);
                }
                console.log(`[Clarin] Found ${links.length} potential articles from RSS. Scraping up to ${limit}...`);
            }

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
                            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5'
                        }
                    });

                    if (!artRes.ok) continue;
                    const artHtml = await artRes.text();
                    const $art = cheerio.load(artHtml);

                    const publishedAt = this.parseDateCandidates([
                        $art('meta[property="article:published_time"]').attr('content'),
                        $art('meta[itemprop="datePublished"]').attr('content'),
                        $art('time[datetime]').first().attr('datetime'),
                        this.jsonLdDatePublished($art('script[type="application/ld+json"]').map((_, s) => $art(s).text()).get())
                    ]);
                    if (!this.isFromToday(publishedAt)) {
                        console.log(`[Clarin] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                        continue;
                    }

                    const title = $art('h1').first().text().trim() ||
                        $art('.title').first().text().trim() ||
                        $art('article h1').first().text().trim();

                    let content = '';
                    const bodySelectors = ['.body-nota', '.body-article', 'article', '.content-nota', '.entry-content', 'div[class*="body"]'];
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';

                    for (const sel of bodySelectors) {
                        const pars = $art(`${sel} p`);
                        if (pars.length > 2) {
                            const pTexts: string[] = [];
                            pars.each((_, p) => {
                                if ($art(p).closest(embedAncestor).length > 0) return;
                                pTexts.push($art(p).text().trim());
                            });
                            content = this.cleanParagraphs(pTexts).join('\n\n');
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
                            publishedAt: publishedAt ?? new Date(),
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

            console.log(`[Clarin] Scraped total ${allArticles.length} unique articles.`);
            return allArticles;

        } catch (error) {
            console.error(`[Clarin] RSS feed scrape failed:`, error);
            throw error;
        }
    }

    // Repetitive auto-generated "cotización" SEO pages that flood Clarín's economía
    // feed and are irrelevant for an Argentine reader: the dollar's value in other
    // countries ("dólar hoy en Venezuela/Uruguay/…") and daily currency-quote pages
    // ("euro hoy", "dólar CCL/MEP/blue hoy … cotiza"). We drop these by URL slug.
    private isQuoteFiller(url: string): boolean {
        const slug = (url.split('/').pop() || '').toLowerCase();
        if (/^dolar-hoy-en-/.test(slug)) return true;              // dollar quote for another country
        if (/-hoy-.*cotiz/.test(slug)) return true;                // "<moneda> hoy … cotiza/cotización"
        return false;
    }

    // Required by BaseScraper interface, but unused here
    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
