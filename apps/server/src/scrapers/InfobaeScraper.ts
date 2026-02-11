import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class InfobaeScraper extends BaseScraper {
    name = 'Infobae';
    baseUrl = 'https://www.infobae.com';
    sections = [
        'https://www.infobae.com/politica',
        'https://www.infobae.com/economia',
        'https://www.infobae.com/sociedad',
        'https://www.infobae.com/deportes'
    ];

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[Infobae] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        const articleLinks = await page.evaluate((currentUrl) => {
            const seen = new Set<string>();
            const links: string[] = [];
            // Infer section from current URL if possible, e.g. /politica/
            const sectionMatch = currentUrl.match(/infobae\.com\/([^/]+)/);
            const section = sectionMatch ? sectionMatch[1] : null;

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                // Filter logic
                // 1. Must be a detailed article, usually has a long path or specific structure.
                // 2. Infobae structure: /section/2026/... or just /section/slug
                // We want to avoid just /section/

                const fullUrl = href.startsWith('http') ? href : `https://www.infobae.com${href}`;

                if (fullUrl === currentUrl) return;

                // Basic heuristic: contains the section name (if known) and is long enough
                if (section && !fullUrl.includes(`/${section}/`)) return;

                // Simple heuristic: length check to avoid menu links
                // e.g. /politica/ is short. /politica/article-title is longer.
                const path = new URL(fullUrl).pathname;
                if (path.length > 20 && !path.includes('/tag/')) {
                    if (!seen.has(fullUrl)) {
                        seen.add(fullUrl);
                        links.push(fullUrl);
                    }
                }
            });
            return links;
        }, page.url());

        const articles: ScrapedArticle[] = [];

        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[Infobae] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText || '';

                    // Infobae Body
                    // usually p elements inside .article-body or .body-article
                    let content = '';
                    const paragraphs = document.querySelectorAll('p.paragraph, .article-body p, #article-content p');
                    if (paragraphs.length > 0) {
                        content = Array.from(paragraphs).map(p => (p as HTMLElement).innerText).join('\n\n');
                    }

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.visual__image')?.getAttribute('src') ||
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
                    console.log(`[Infobae] Success: ${data.title.substring(0, 30)}...`);
                }
            } catch (e) {
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
