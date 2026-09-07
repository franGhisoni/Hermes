import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

const SECTION_NAMES: Record<string, string> = {
    'politica': 'Política',
    'sociedad': 'Sociedad',
    'deportes': 'Deportes',
    'economia': 'Economía',
    'provincia': 'Provincia',
    'judiciales': 'Judiciales',
    'policiales': 'Policiales',
    'la-plata': 'La Plata',
    'municipios': 'Municipios'
};

/**
 * Scraper for Infocielo (https://www.infocielo.com).
 * Uses BaseScraper (Puppeteer with stealth plugin) because Infocielo is protected
 * by Cloudflare WAF, which blocks standard Node fetch() requests with HTTP 403.
 */
export class InfocieloScraper extends BaseScraper {
    name = 'Infocielo';
    baseUrl = 'https://www.infocielo.com';

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        console.log(`[Infocielo] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Discover article links on the page
        const candidateItems = await page.evaluate((targetUrl) => {
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            const seen = new Set<string>();
            const links: { url: string; title?: string }[] = [];
            const targetPath = new URL(targetUrl).pathname.replace(/\/+$/, '');
            const requestedSection = targetPath && targetPath !== '/'
                ? targetPath.split('/').filter(Boolean)[0]?.toLowerCase()
                : null;
            const articleRe = /^\/(politica|sociedad|deportes|economia|provincia|judiciales|policiales|la-plata|municipios)\/[^/]+\/?$/i;

            for (const a of anchors) {
                const rawHref = (a as HTMLAnchorElement).href;
                if (!rawHref) continue;

                let fullUrl: string;
                try {
                    const u = new URL(rawHref, 'https://www.infocielo.com');
                    if (u.hostname !== 'www.infocielo.com' && u.hostname !== 'infocielo.com') continue;
                    u.hash = '';
                    u.search = '';
                    fullUrl = u.toString().replace(/\/amp\/?$/i, '/').replace(/\/+$/, '');
                } catch {
                    continue;
                }

                const path = new URL(fullUrl).pathname;
                if (!articleRe.test(path)) continue;
                if (requestedSection && !path.toLowerCase().startsWith(`/${requestedSection}/`)) continue;

                if (!seen.has(fullUrl)) {
                    seen.add(fullUrl);
                    const title = a.textContent?.trim() || a.getAttribute('aria-label')?.trim() || undefined;
                    links.push({ url: fullUrl, title });
                }
            }
            return links;
        }, url);

        console.log(`[Infocielo] Discovered ${candidateItems.length} candidate articles on ${url}.`);
        this.recordCandidates(candidateItems);

        const articles: ScrapedArticle[] = [];

        for (const candidate of candidateItems) {
            if (articles.length >= this.requestedLimit) break;
            const link = candidate.url;

            try {
                this.recordVisit(link, candidate.title);
                console.log(`[Infocielo] Visiting ${link}`);
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });

                const publishedAt = await this.extractPublishedDate(page) ?? this.dateFromUrl(link);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip(link, publishedAt, candidate.title);
                    console.log(`[Infocielo] Skipping non-today article (${publishedAt?.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText?.trim() ||
                        document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';

                    const image = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                        document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
                        document.querySelector('article img')?.getAttribute('src');

                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    const pEls = Array.from(document.querySelectorAll('article p, .article-content p, .article__body p, main article p'));
                    const paragraphs = pEls
                        .filter(p => !p.closest(embedAncestor))
                        .map(p => ((p as HTMLElement).innerText || '').trim())
                        .filter(t => t.length > 0);

                    return { title, image, paragraphs };
                });

                const title = data.title || candidate.title || '';
                const content = this.cleanParagraphs(data.paragraphs).join('\n\n');

                if (!title || !content) {
                    this.recordContentSkip(
                        link,
                        title,
                        `Contenido insuficiente: título ${title ? 'presente' : 'ausente'}, ${content.length} caracteres extraídos.`
                    );
                    continue;
                }

                let section: string | undefined;
                try {
                    const seg = new URL(link).pathname.split('/').filter(Boolean)[0]?.toLowerCase();
                    if (seg && SECTION_NAMES[seg]) section = SECTION_NAMES[seg];
                } catch {
                    // Ignore URL parsing errors for section
                }

                articles.push({
                    title,
                    content,
                    url: link,
                    imageUrl: data.image || undefined,
                    publishedAt: publishedAt ?? new Date(),
                    section
                });

                this.recordAccepted(
                    link,
                    title,
                    publishedAt,
                    content.length,
                    'Fecha y contenido válidos extraídos exitosamente vía navegador.'
                );
                console.log(`[Infocielo] Success: ${title.substring(0, 40)}...`);
            } catch (err) {
                this.recordFailure(err, link, candidate.title);
                console.error(`[Infocielo] Error scraping ${link}:`, err);
            }
        }

        console.log(`[Infocielo] Scraped ${articles.length} valid articles.`);
        return articles;
    }
}
