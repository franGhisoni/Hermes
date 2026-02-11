import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class ClarinScraper extends BaseScraper {
    name = 'Clarin';
    baseUrl = 'https://www.clarin.com';
    sections = [
        'https://www.clarin.com/politica',
        'https://www.clarin.com/economia',
        'https://www.clarin.com/sociedad',
        'https://www.clarin.com/deportes'
    ];

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for body to ensure page loaded
        try {
            await page.waitForSelector('body', { timeout: 10000 });
        } catch (e) {
            console.log('[Clarin] Timeout waiting for body');
        }

        // Extract links to articles from the main page
        // Extract unique article links based on URL pattern
        const articleLinks = await page.evaluate(() => {
            const seen = new Set<string>();
            const links: string[] = [];

            const anchors = document.querySelectorAll('a');
            console.log(`[Browser Clarin] Found ${anchors.length} anchors.`);

            anchors.forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                // Clarin articles usually end in .html and have an ID structure
                // e.g. /politica/titulo_0_id.html
                if (href.includes('.html') && !href.includes('/videos/') && !href.includes('/fotogalerias/')) {
                    const fullUrl = href.startsWith('http') ? href : `https://www.clarin.com${href}`;
                    if (!seen.has(fullUrl)) {
                        seen.add(fullUrl);
                        links.push(fullUrl);
                    }
                }
            });
            return links; // Return all found links, BaseScraper handles the global limit
        });

        const scrapedArticles: ScrapedArticle[] = [];

        // Visit each article 
        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[Clarin] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText ||
                        (document.querySelector('.title') as HTMLElement)?.innerText ||
                        (document.querySelector('article h1') as HTMLElement)?.innerText || '';

                    // Try multiple body selectors common in news sites / Clarin
                    const bodySelectors = ['.body-nota', '.body-article', 'article', '.content-nota', '.entry-content', 'div[class*="body"]'];
                    let content = '';

                    for (const sel of bodySelectors) {
                        const els = document.querySelectorAll(`${sel} p`);
                        if (els.length > 2) {
                            content = Array.from(els).map(p => (p as HTMLElement).innerText).join('\n\n');
                            break;
                        }
                    }

                    // Image Fallbacks
                    const image = document.querySelector('picture img')?.getAttribute('src') ||
                        document.querySelector('article img')?.getAttribute('src') ||
                        document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                    return { title, content, image };
                });

                if (data.title && data.content) {
                    scrapedArticles.push({
                        title: data.title,
                        content: data.content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: new Date()
                    });
                    console.log(`[Clarin] Success: ${data.title.substring(0, 30)}...`);
                } else {
                    console.log(`[Clarin-Debug] Skip: ${link}. Title?: ${!!data.title} (${data.title.length}), Content?: ${data.content.length}`);
                }

            } catch (e) {
                console.error(`Error scraping article ${link}`, e);
            }
        }

        return scrapedArticles;
    }
}
