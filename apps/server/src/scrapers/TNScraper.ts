import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class TNScraper extends BaseScraper {
    name = 'TN';
    baseUrl = 'https://tn.com.ar';

    sections = [
        'https://tn.com.ar/politica',
        'https://tn.com.ar/economia',
        'https://tn.com.ar/sociedad',
        'https://tn.com.ar/deportes'
    ];

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[TN] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        const articleLinks = await page.evaluate(() => {
            const seen = new Set<string>();
            const links: string[] = [];

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                // TN articles: /politica/2026/... or /deportes/2026/...
                const fullUrl = href.startsWith('http') ? href : `https://tn.com.ar${href}`;

                // Basic validation: match standard TN article structure
                // usually /section/date/...
                if (fullUrl.includes('/politica/') || fullUrl.includes('/economia/') || fullUrl.includes('/sociedad/') || fullUrl.includes('/deportes/')) {
                    if (fullUrl.length > 50) { // Avoid short section links
                        if (!seen.has(fullUrl)) {
                            seen.add(fullUrl);
                            links.push(fullUrl);
                        }
                    }
                }
            });
            return links; // BaseScraper handles limit
        });

        const articles: ScrapedArticle[] = [];

        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[TN] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText ||
                        (document.querySelector('.article__title') as HTMLElement)?.innerText || '';

                    // TN often uses these classes
                    const contentElement = document.querySelector('.article-content') ||
                        document.querySelector('.cuerpo-nota') ||
                        document.querySelector('.article__body') ||
                        document.querySelector('article .content');

                    const content = (contentElement as HTMLElement)?.innerText || '';

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.article-main-media img')?.getAttribute('src') ||
                        document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                    return { title, content, image };
                });

                if (data.title && data.content) {
                    articles.push({
                        title: data.title,
                        content: data.content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: new Date()
                    });
                    console.log(`[TN] Success: ${data.title.substring(0, 30)}...`);
                }
            } catch (e) {
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
