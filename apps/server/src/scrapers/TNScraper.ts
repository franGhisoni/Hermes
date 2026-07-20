import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class TNScraper extends BaseScraper {
    name = 'TN';
    baseUrl = 'https://tn.com.ar';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[TN] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        const articleLinks = await page.evaluate((currentUrl) => {
            const seen = new Set<string>();
            const links: string[] = [];
            const requestedSection = new URL(currentUrl).pathname.split('/').filter(Boolean).pop();

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                // TN articles: /politica/2026/... or /deportes/2026/...
                const fullUrl = href.startsWith('http') ? href : `https://tn.com.ar${href}`;

                // Basic validation: match standard TN article structure
                // usually /section/date/...
                if (requestedSection && fullUrl.includes(`/${requestedSection}/`)) {
                    if (fullUrl.length > 50) { // Avoid short section links
                        if (!seen.has(fullUrl)) {
                            seen.add(fullUrl);
                            links.push(fullUrl);
                        }
                    }
                }
            });
            return links; // BaseScraper handles limit
        }, url);

        const articles: ScrapedArticle[] = [];
        this.recordCandidates(articleLinks.length);

        for (const link of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[TN] Visiting ${link}`);
            try {
                this.recordVisit();
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const publishedAt = await this.extractPublishedDate(page) ?? this.dateFromUrl(link);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip();
                    console.log(`[TN] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText ||
                        (document.querySelector('.article__title') as HTMLElement)?.innerText || '';

                    // TN often uses these classes
                    const contentElement = document.querySelector('.article-content') ||
                        document.querySelector('.cuerpo-nota') ||
                        document.querySelector('.article__body') ||
                        document.querySelector('article .content');

                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    let paragraphs: string[] = [];
                    if (contentElement) {
                        const pEls = contentElement.querySelectorAll('p');
                        if (pEls.length > 0) {
                            paragraphs = Array.from(pEls)
                                .filter(p => !(p as HTMLElement).closest(embedAncestor))
                                .map(p => (p as HTMLElement).innerText.trim())
                                .filter(t => t.length > 0);
                        } else {
                            // Fallback to innerText split by blank lines
                            paragraphs = ((contentElement as HTMLElement).innerText || '')
                                .split(/\n\s*\n+/)
                                .map(t => t.trim())
                                .filter(t => t.length > 0);
                        }
                    }

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.article-main-media img')?.getAttribute('src') ||
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
                    console.log(`[TN] Success: ${data.title.substring(0, 30)}...`);
                } else this.recordContentSkip();
            } catch (e) {
                this.recordFailure(e);
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
