import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class InfobaeScraper extends BaseScraper {
    name = 'Infobae';
    baseUrl = 'https://www.infobae.com';

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
        this.recordCandidates(articleLinks.length);

        for (const link of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[Infobae] Visiting ${link}`);
            try {
                this.recordVisit();
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const publishedAt = await this.extractPublishedDate(page);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip();
                    console.log(`[Infobae] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText || '';

                    // Infobae Body
                    // usually p elements inside .article-body or .body-article
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    const pEls = document.querySelectorAll('p.paragraph, .article-body p, #article-content p');
                    const paragraphs = Array.from(pEls)
                        .filter(p => !(p as HTMLElement).closest(embedAncestor))
                        .map(p => (p as HTMLElement).innerText.trim())
                        .filter(t => t.length > 0);

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.visual__image')?.getAttribute('src') ||
                        document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                    return { title, paragraphs, image };
                });

                const content = this.cleanParagraphs(data.paragraphs).join('\n\n');
                if (data.title && content) {
                    articles.push({
                        title: data.title,
                        content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: publishedAt ?? new Date()
                    });
                    this.recordAccepted();
                    console.log(`[Infobae] Success: ${data.title.substring(0, 30)}...`);
                } else this.recordContentSkip();
            } catch (e) {
                this.recordFailure(e);
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
