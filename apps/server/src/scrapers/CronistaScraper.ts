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

            // The form markup changes frequently. Login is optional for the
            // public articles, so do not let an unavailable login form become
            // a scraper failure or delay every run by ten seconds.
            const emailSelector = 'input#email, input[type="email"], input[name="email"]';
            const passwordSelector = 'input#password, input[type="password"], input[name="password"]';
            const emailInput = await page.waitForSelector(emailSelector, { visible: true, timeout: 3000 }).catch(() => null);
            const passwordInput = await page.waitForSelector(passwordSelector, { visible: true, timeout: 3000 }).catch(() => null);
            if (!emailInput || !passwordInput) {
                console.warn('[Cronista] Login form unavailable; continuing with public articles.');
                return false;
            }

            await emailInput.type(user, { delay: 30 });
            await passwordInput.type(pass, { delay: 30 });

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
            // Authentication is a best-effort enhancement. Article failures are
            // recorded separately, so this must not turn an otherwise valid
            // public scrape into a misleading failure in the admin diagnostics.
            console.warn('[Cronista] Login unavailable; continuing with public articles:', e);
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
        this.recordCandidates(articleLinks.length);

        for (const link of articleLinks) {
            // The old limit was applied only by BaseScraper after every link was
            // visited. On busy pages that meant minutes of unnecessary work.
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[Cronista] Visiting ${link}`);
            let fallbackPage: Page | null = null;
            try {
                this.recordVisit();
                let articlePage: Page = page;
                try {
                    await articlePage.goto(link, { waitUntil: 'domcontentloaded' });
                } catch (navigationError: any) {
                    // Cronista occasionally aborts Chromium navigation for an
                    // otherwise public, 200-response article. Reuse the HTML
                    // through Node's fetch instead of discarding that article.
                    if (!String(navigationError?.message || navigationError).includes('ERR_ABORTED')) throw navigationError;

                    console.warn(`[Cronista] Browser navigation aborted; retrying with fetch: ${link}`);
                    const response = await fetch(link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
                        }
                    });
                    if (!response.ok) throw new Error(`Fallback fetch returned ${response.status}`);
                    // The original page can still be navigating after ERR_ABORTED;
                    // use an isolated page so setContent/evaluate are stable.
                    fallbackPage = await page.browser().newPage();
                    articlePage = fallbackPage;
                    await articlePage.setContent(await response.text(), { waitUntil: 'domcontentloaded' });
                }

                const publishedAt = await this.extractPublishedDate(articlePage);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip();
                    console.log(`[Cronista] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await articlePage.evaluate(() => {
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
                    this.recordContentSkip();
                    console.log(`[Cronista] Paywalled, skipping: ${link}`);
                    continue;
                }

                if (data.title && content) {
                    articles.push({
                        title: data.title,
                        content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: publishedAt ?? new Date()
                    });
                    this.recordAccepted();
                    console.log(`[Cronista] Success: ${data.title.substring(0, 30)}...`);
                } else {
                    this.recordContentSkip();
                    console.log(`[Cronista-Debug] Skip: ${link}. Title?: ${!!data.title}, Content length: ${content.length}`);
                }
            } catch (e) {
                this.recordFailure(e);
                console.error(`[Cronista] Error scraping ${link}`, e);
            } finally {
                await fallbackPage?.close().catch(() => undefined);
            }
        }

        return articles;
    }
}
