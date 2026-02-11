import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class LaNacionScraper extends BaseScraper {
    name = 'LaNacion';
    baseUrl = 'https://www.lanacion.com.ar';
    sections = [
        'https://www.lanacion.com.ar/politica',
        'https://www.lanacion.com.ar/economia',
        'https://www.lanacion.com.ar/sociedad',
        'https://www.lanacion.com.ar/deportes'
    ];

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        // Use the instance baseUrl (which might be overwritten with a section URL)
        console.log(`[LaNacion] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        const articleLinks = await page.evaluate(() => {
            const seen = new Set<string>();
            const links: string[] = [];

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                // La Nacion articles have -nid followed by numbers
                // avoiding generic tags or categories if they don't match the pattern
                if (href.match(/-nid\d+/)) {
                    const fullUrl = href.startsWith('http') ? href : `https://www.lanacion.com.ar${href}`;
                    if (!seen.has(fullUrl)) {
                        seen.add(fullUrl);
                        links.push(fullUrl);
                    }
                }
            });
            return links;
        });

        const articles: ScrapedArticle[] = [];

        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[LaNacion] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText || '';

                    // Body selectors for La Nacion
                    const bodySelectors = ['.c-cuerpo', '.body-nota', '#cuerpo-nota', 'section.cuerpo', 'article', 'section'];
                    let content = '';

                    for (const sel of bodySelectors) {
                        const els = document.querySelectorAll(`${sel} p`);
                        if (els.length > 2) {
                            content = Array.from(els).map(p => (p as HTMLElement).innerText).join('\n\n');
                            console.log(`[Browser LaNacion] Found content with selector ${sel}, length: ${content.length}`);
                            break;
                        }
                    }
                    console.log(`[Browser LaNacion] Title found: ${!!title}, Content found: ${!!content}`);

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.c-foco img')?.getAttribute('src') ||
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
                    console.log(`[LaNacion] Success: ${data.title.substring(0, 30)}...`);
                }
            } catch (e) {
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
