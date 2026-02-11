import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class NAScraper extends BaseScraper {
    name = 'NA';
    baseUrl = 'https://noticiasargentinas.com';

    sections = [
        'https://noticiasargentinas.com/politica',
        'https://noticiasargentinas.com/economia',
        'https://noticiasargentinas.com/sociedad',
        'https://noticiasargentinas.com/deportes'
    ];

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[NA] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const articleLinks = await page.evaluate(() => {
            const seen = new Set<string>();
            const links: string[] = [];

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                const fullUrl = href.startsWith('http') ? href : `https://noticiasargentinas.com${href}`;

                // NA articles usually have /nota/ or just a long slug in section
                if (href.includes('/politica/') || href.includes('/economia/') || href.includes('/sociedad/') || href.includes('/deportes/')) {
                    if (href.length > 30 && !href.match(/\/(tag|tema|seccion)\//)) {
                        if (!seen.has(fullUrl)) {
                            seen.add(fullUrl);
                            links.push(fullUrl);
                        }
                    }
                }
            });
            return links;
        });

        const articles: ScrapedArticle[] = [];

        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[NA] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText || '';
                    const content = (document.querySelector('.news-body') as HTMLElement)?.innerText ||
                        (document.querySelector('.body') as HTMLElement)?.innerText || '';
                    const image = document.querySelector('figure img')?.getAttribute('src');
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
                    console.log(`[NA] Success: ${data.title.substring(0, 30)}...`);
                }
            } catch (e) {
                console.error(`Error scraping ${link}`, e);
            }
        }
        return articles;
    }
}
