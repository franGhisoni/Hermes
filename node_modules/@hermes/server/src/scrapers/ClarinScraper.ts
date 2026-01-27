import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class ClarinScraper extends BaseScraper {
    name = 'Clarin';
    baseUrl = 'https://www.clarin.com';

    protected async performScrape(page: Page): Promise<ScrapedArticle[]> {
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links to articles from the main page
        const articleLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('article a'));
            return links
                .map(link => link.getAttribute('href'))
                .filter(href => href && href.startsWith('http'))
                // Avoid videos/galleries if possible - basic heuristic
                .filter(href => !href?.includes('/videos/') && !href?.includes('/fotogalerias/'))
                .slice(0, 5);
        });

        const scrapedArticles: ScrapedArticle[] = [];

        // Visit each article 
        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[Clarin] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText ||
                        document.querySelector('.title')?.innerText ||
                        document.querySelector('article h1')?.innerText || '';

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
