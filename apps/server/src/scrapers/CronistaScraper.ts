import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';

export class CronistaScraper extends BaseScraper {
    name = 'Cronista';
    baseUrl = 'https://www.cronista.com';

    private loggedIn = false;

    private async login(page: Page): Promise<boolean> {
        const user = process.env.CRONISTA_USER;
        const pass = process.env.CRONISTA_PASS;

        if (!user || !pass) {
            console.warn('[Cronista] CRONISTA_USER / CRONISTA_PASS not set — scraping without login (paywalled articles will be skipped).');
            return false;
        }

        try {
            console.log('[Cronista] Logging in via /ingresa/...');
            await page.goto('https://www.cronista.com/ingresa/?returnTo=/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            // The email form is collapsed by default — first click "Iniciá sesión con tu E-mail" to reveal it.
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button, a')).find(el => /tu\s+e-?mail/i.test((el as HTMLElement).innerText || ''));
                (btn as HTMLElement | undefined)?.click();
            });

            // Wait for the email input to be present and visible.
            await page.waitForSelector('input#email', { visible: true, timeout: 10000 });

            await page.type('input#email', user, { delay: 30 });
            await page.type('input#password', pass, { delay: 30 });

            // Submit and wait for navigation away from /ingresa/.
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
                page.click('button.user-access__btn--submit')
            ]);

            const currentUrl = page.url();
            const ok = !currentUrl.includes('/ingresa');
            console.log(`[Cronista] Login ${ok ? 'OK' : 'likely failed'} (url=${currentUrl})`);
            return ok;
        } catch (e) {
            console.error('[Cronista] Login error:', e);
            return false;
        }
    }

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        if (!this.loggedIn) {
            this.loggedIn = await this.login(page);
        }

        console.log(`[Cronista] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const articleLinks = await page.evaluate((currentUrl) => {
            const seen = new Set<string>();
            const links: string[] = [];
            const sectionMatch = currentUrl.match(/cronista\.com\/([^/]+)/);
            const section = sectionMatch ? sectionMatch[1] : null;

            document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                const fullUrl = href.startsWith('http') ? href : `https://www.cronista.com${href}`;
                if (fullUrl === currentUrl) return;
                if (!fullUrl.includes('cronista.com')) return;

                const path = new URL(fullUrl).pathname;

                // Filter to current section if known
                if (section && !path.startsWith(`/${section}/`)) return;

                // Cronista articles: /{section}/{long-slug-with-dashes}/  — require trailing slash,
                // at least 3 hyphens in the slug, and avoid known non-article paths.
                const segments = path.split('/').filter(Boolean);
                if (segments.length < 2) return;
                const slug = segments[segments.length - 1];
                if ((slug.match(/-/g) || []).length < 3) return;

                if (
                    path.includes('/tag/') ||
                    path.includes('/autor/') ||
                    path.includes('/tema/') ||
                    path.includes('/MercadosOnline/') ||
                    path.includes('/resizer/') ||
                    path.includes('/columnistas/') ||
                    path.includes('/cronista-studio/') ||
                    /\.(html|asp|png|jpg|webp)$/i.test(path)
                ) return;

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
            console.log(`[Cronista] Visiting ${link}`);
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });

                const data = await page.evaluate(() => {
                    const title = (document.querySelector('h1') as HTMLElement)?.innerText || '';

                    // Detect paywall — Cronista often inserts a "suscribite" wall.
                    const bodyText = document.body.innerText || '';
                    const paywalled =
                        document.querySelector('.paywall, .subscription-wall, [class*="paywall"], [class*="suscrib"]') !== null ||
                        /suscrib[íi]te para seguir leyendo|contenido exclusivo para suscriptores/i.test(bodyText);

                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    const pEls = document.querySelectorAll(
                        '.article-body p, .news-body-content p, .article__body p, [class*="article-body"] p, [class*="news-body"] p, article p'
                    );
                    const paragraphs = Array.from(pEls)
                        .filter(p => !(p as HTMLElement).closest(embedAncestor))
                        .map(p => (p as HTMLElement).innerText.trim())
                        .filter(t => t.length > 0);

                    const image =
                        document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('article img')?.getAttribute('src') ||
                        document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                    return { title, paragraphs, image, paywalled };
                });

                const content = this.cleanParagraphs(data.paragraphs).join('\n\n');

                if (data.paywalled && content.length < 500) {
                    console.log(`[Cronista] Paywalled, skipping: ${link}`);
                    continue;
                }

                if (data.title && content) {
                    articles.push({
                        title: data.title,
                        content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: new Date()
                    });
                    console.log(`[Cronista] Success: ${data.title.substring(0, 30)}...`);
                } else {
                    console.log(`[Cronista-Debug] Skip: ${link}. Title?: ${!!data.title}, Content length: ${content.length}`);
                }
            } catch (e) {
                console.error(`[Cronista] Error scraping ${link}`, e);
            }
        }

        return articles;
    }
}
