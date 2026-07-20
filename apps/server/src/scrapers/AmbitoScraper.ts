import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class AmbitoScraper extends BaseScraper {
    name = 'Ambito';
    baseUrl = 'https://www.ambito.com';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[Ambito] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        let articleLinks = await page.evaluate((currentUrl) => {
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

        const sectionPageLinksCount = articleLinks.length;

        // The section landing page is editorially curated and currently exposes
        // only 12 political notes. Ambito's official RSS contains the complete
        // chronological section feed (20 entries), so prefer it when available.
        try {
            const section = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (section) {
                const rssUrl = `https://www.ambito.com/rss/pages/${section}.xml`;
                await page.goto(rssUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                const rssLinks = await page.evaluate((sectionName) => {
                    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pattern = new RegExp(`https://www\\.ambito\\.com/${escaped}/[^\\s<]+-n\\d+/?`, 'g');
                    const matches = (document.body.innerText || '').match(pattern) || [];
                    return Array.from(new Set(matches));
                }, section);

                if (rssLinks.length > 0) {
                    articleLinks = rssLinks;
                    console.log(`[Ambito] Found ${rssLinks.length} articles in RSS (section page had ${sectionPageLinksCount}).`);
                }
            }
        } catch (error) {
            // Keep the landing-page links if RSS is temporarily unavailable.
            console.warn('[Ambito] RSS lookup failed; using section page links:', error);
        }

        const articles: ScrapedArticle[] = [];
        this.recordCandidates(articleLinks.length);

        for (const link of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[Ambito] Visiting ${link}`);
            try {
                this.recordVisit();
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const publishedAt = await this.extractPublishedDate(page);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip();
                    console.log(`[Ambito] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText || '';

                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    const pEls = document.querySelectorAll(
                        '.article-body p, .news-body-content p, .article__body p, [class*="article-body"] p, [class*="news-body"] p'
                    );
                    const paragraphs = Array.from(pEls)
                        .filter(p => !(p as HTMLElement).closest(embedAncestor))
                        .map(p => (p as HTMLElement).innerText.trim())
                        .filter(t => t.length > 0);

                    const image =
                        document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('article img')?.getAttribute('src') ||
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
                    console.log(`[Ambito] Success: ${data.title.substring(0, 30)}...`);
                } else {
                    this.recordContentSkip();
                    console.log(`[Ambito-Debug] Skip: ${link}. Title?: ${!!data.title}, Content length: ${content.length}`);
                }
            } catch (e) {
                this.recordFailure(e);
                console.error(`[Ambito] Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
