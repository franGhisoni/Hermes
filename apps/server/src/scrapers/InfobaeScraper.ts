import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class InfobaeScraper extends BaseScraper {
    name = 'Infobae';
    baseUrl = 'https://www.infobae.com';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[Infobae] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Extract links
        type ArticleCandidate = { url: string; publishedAt?: Date };
        let articleLinks: ArticleCandidate[] = (await page.evaluate((currentUrl) => {
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
        }, page.url())).map(url => ({ url }));
        let candidateCount = articleLinks.length;

        // Infobae exposes a per-section RSS feed with a much larger, ordered
        // inventory than the curated landing page. Its pubDate is also more
        // reliable than the article-page markup for deciding "today".
        try {
            const section = new URL(url).pathname.split('/').filter(Boolean).pop();
            const rssUrl = await page.evaluate(() =>
                (document.querySelector('link[type="application/rss+xml"]') as HTMLLinkElement | null)?.href || null
            );
            if (section && rssUrl) {
                await page.goto(rssUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                const rssItems = await page.evaluate((sectionName) => {
                    const text = document.body.innerText || '';
                    const itemPattern = /<item>[\s\S]*?<link>(https:\/\/www\.infobae\.com\/[^<]+)<\/link>[\s\S]*?<pubDate>([^<]+)<\/pubDate>[\s\S]*?<\/item>/g;
                    const items: Array<{ url: string; publishedAt: string }> = [];
                    let match: RegExpExecArray | null;
                    while ((match = itemPattern.exec(text)) !== null) {
                        if (new URL(match[1]).pathname.startsWith(`/${sectionName}/`)) {
                            items.push({ url: match[1], publishedAt: match[2] });
                        }
                    }
                    return items;
                }, section);
                if (rssItems.length > 0) {
                    candidateCount = rssItems.length;
                    articleLinks = rssItems.map(item => ({ url: item.url, publishedAt: new Date(item.publishedAt) }));
                    const currentItems = articleLinks.filter(item => this.isFromToday(item.publishedAt!));
                    const skippedByDate = articleLinks.length - currentItems.length;
                    for (let i = 0; i < skippedByDate; i++) this.recordDateSkip();
                    articleLinks = currentItems;
                    console.log(`[Infobae] Found ${rssItems.length} articles in RSS.`);
                }
            }
        } catch (error) {
            console.warn('[Infobae] RSS lookup failed; using section page links:', error);
        }

        const articles: ScrapedArticle[] = [];
        this.recordCandidates(candidateCount);

        for (const candidate of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            const link = candidate.url;
            console.log(`[Infobae] Visiting ${link}`);
            try {
                this.recordVisit();
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const publishedAt = candidate.publishedAt ?? await this.extractPublishedDate(page);
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
