import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class AmbitoScraper extends BaseScraper {
    name = 'Ambito';
    baseUrl = 'https://www.ambito.com';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[Ambito] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const articleLinks = await page.evaluate((currentUrl) => {
            const seen = new Set<string>();
            const links: string[] = [];
            const sectionMatch = currentUrl.match(/ambito\.com\/([^/]+)/);
            const section = sectionMatch ? sectionMatch[1] : null;

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                const fullUrl = href.startsWith('http') ? href : `https://www.ambito.com${href}`;
                if (fullUrl === currentUrl) return;
                if (!fullUrl.includes('ambito.com')) return;

                const path = new URL(fullUrl).pathname;

                // Ambito article paths end with -n{numeric-id}, e.g. /politica/some-slug-n6277507
                if (!/-n\d+\/?$/.test(path)) return;

                // Filter to current section if known
                if (section && !path.startsWith(`/${section}/`)) return;

                // Exclude non-article paths
                if (path.includes('/contenidos/') || path.includes('/tag/') || path.includes('/autor/') || path.includes('/tema/')) return;

                if (!seen.has(fullUrl)) {
                    seen.add(fullUrl);
                    links.push(fullUrl);
                }
            });
            return links;
        }, page.url());

        const articles: ScrapedArticle[] = [];

        for (const link of articleLinks) {
            if (!link) continue;
            console.log(`[Ambito] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText || '';

                    let content = '';
                    const paragraphs = document.querySelectorAll(
                        '.article-body p, .news-body-content p, .article__body p, [class*="article-body"] p, [class*="news-body"] p'
                    );
                    if (paragraphs.length > 0) {
                        content = Array.from(paragraphs)
                            .map(p => (p as HTMLElement).innerText.trim())
                            .filter(t => t.length > 0)
                            .join('\n\n');
                    }

                    const image =
                        document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('article img')?.getAttribute('src') ||
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
                    console.log(`[Ambito] Success: ${data.title.substring(0, 30)}...`);
                } else {
                    console.log(`[Ambito-Debug] Skip: ${link}. Title?: ${!!data.title}, Content length: ${data.content.length}`);
                }
            } catch (e) {
                console.error(`[Ambito] Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
