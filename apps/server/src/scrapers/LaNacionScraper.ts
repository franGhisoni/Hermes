import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class LaNacionScraper extends BaseScraper {
    name = 'LaNacion';
    baseUrl = 'https://www.lanacion.com.ar';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        // Use the instance baseUrl (which might be overwritten with a section URL)
        console.log(`[LaNacion] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        const articleLinks = await page.evaluate((currentUrl) => {
            const seen = new Set<string>();
            const links: string[] = [];
            const requestedSection = new URL(currentUrl).pathname.split('/').filter(Boolean).pop();

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                // La Nacion articles have -nid followed by numbers
                // avoiding generic tags or categories if they don't match the pattern
                if (href.match(/-nid\d+/)) {
                    const fullUrl = href.startsWith('http') ? href : `https://www.lanacion.com.ar${href}`;
                    if (requestedSection && !new URL(fullUrl).pathname.startsWith(`/${requestedSection}/`)) return;
                    if (!seen.has(fullUrl)) {
                        seen.add(fullUrl);
                        links.push(fullUrl);
                    }
                }
            });
            return links;
        }, url);

        const articles: ScrapedArticle[] = [];
        this.recordCandidates(articleLinks.length);

        for (const link of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[LaNacion] Visiting ${link}`);
            try {
                this.recordVisit();
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const publishedAt = await this.extractPublishedDate(page) ?? this.dateFromUrl(link);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip();
                    console.log(`[LaNacion] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText || '';

                    // Body selectors for La Nacion
                    const bodySelectors = ['.c-cuerpo', '.body-nota', '#cuerpo-nota', 'section.cuerpo', 'article', 'section'];
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    let paragraphs: string[] = [];

                    for (const sel of bodySelectors) {
                        const els = document.querySelectorAll(`${sel} p`);
                        if (els.length > 2) {
                            paragraphs = Array.from(els)
                                .filter(p => !(p as HTMLElement).closest(embedAncestor))
                                .map(p => (p as HTMLElement).innerText.trim())
                                .filter(t => t.length > 0);
                            break;
                        }
                    }

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.c-foco img')?.getAttribute('src') ||
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
                    console.log(`[LaNacion] Success: ${data.title.substring(0, 30)}...`);
                } else this.recordContentSkip();
            } catch (e) {
                this.recordFailure(e);
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
