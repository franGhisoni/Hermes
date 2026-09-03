import { BaseScraper, ScrapedArticle } from './BaseScraper';
import puppeteerExtra from 'puppeteer-extra';
import { Frame, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

export class ClarinScraper extends BaseScraper {
    name = 'Clarin';
    baseUrl = 'https://www.clarin.com';

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        await this.loadScrapeSettings();
        const email = process.env.CLARIN_EMAIL?.trim();
        const password = process.env.CLARIN_PASSWORD;

        if (email && password) {
            try {
                return await this.scrapeAuthenticated(limit, email, password);
            } catch (error) {
                // Authentication is an optional enhancement. Preserve the existing
                // social-crawler scraper when Clarín changes its login UI or rejects
                // the session, and never include credentials in the diagnostic.
                console.warn('[Clarin] Authenticated scrape unavailable; falling back to public fetch:', this.safeError(error));
            }
        } else {
            console.warn('[Clarin] CLARIN_EMAIL / CLARIN_PASSWORD not set; using public fetch.');
        }

        return this.scrapePublic(limit);
    }

    private async scrapeAuthenticated(limit: number, email: string, password: string): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        console.log(`[Clarin] Starting authenticated browser scrape for ${this.baseUrl} with limit ${limit}...`);

        const browser = await puppeteerExtra.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7'
            });

            const loggedIn = await this.login(page, email, password);
            if (!loggedIn) throw new Error('Clarín rejected the login or kept the authentication form open.');

            const sectionUrl = this.sectionUrl();
            console.log(`[Clarin] Authenticated session ready. Fetching section page: ${sectionUrl}`);
            await page.goto(sectionUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const sectionSegment = new URL(sectionUrl).pathname.split('/').filter(Boolean).pop() || 'lo-ultimo';
            const links = await page.evaluate((segment) => {
                const seen = new Set<string>();
                const result: string[] = [];
                const articlePattern = new RegExp(`^https://www\\.clarin\\.com/${segment}/.+\\.html`);

                document.querySelectorAll('a[href]').forEach(anchor => {
                    const rawHref = anchor.getAttribute('href');
                    if (!rawHref) return;
                    const href = new URL(rawHref, 'https://www.clarin.com').href;
                    if (!articlePattern.test(href) || seen.has(href)) return;
                    seen.add(href);
                    result.push(href);
                });
                return result;
            }, sectionSegment);

            const relevantLinks = links.filter(link =>
                !link.includes('/videos/') &&
                !link.includes('/fotogalerias/') &&
                !this.isQuoteFiller(link)
            );

            this.recordCandidates(relevantLinks);
            const articles: ScrapedArticle[] = [];
            const sectionName = sectionSegment.charAt(0).toUpperCase() + sectionSegment.slice(1);

            for (const link of relevantLinks) {
                if (articles.length >= limit) break;
                this.recordVisit(link);

                try {
                    console.log(`[Clarin] Visiting with authenticated session: ${link}`);
                    try {
                        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    } catch (navigationError) {
                        const message = this.safeError(navigationError);
                        const currentUrl = page.url().split('#')[0];
                        // Some subscriber articles abort Chromium's navigation after
                        // committing the document. If the page did land on the target,
                        // keep extracting from that authenticated DOM.
                        if (!message.includes('ERR_ABORTED')) throw navigationError;
                        if (currentUrl === link.split('#')[0]) {
                            console.warn(`[Clarin] Navigation reported ERR_ABORTED after commit; continuing with loaded article: ${link}`);
                        } else {
                            // When Chromium does not expose the committed document,
                            // replay the request with the authenticated session cookies.
                            const cookies = await page.cookies('https://www.clarin.com');
                            const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
                            const response = await fetch(link, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Accept': 'text/html,application/xhtml+xml',
                                    'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8',
                                    'Cookie': cookieHeader
                                }
                            });
                            if (!response.ok) throw navigationError;
                            await page.setContent(await response.text(), { waitUntil: 'domcontentloaded', timeout: 60000 });
                            console.warn(`[Clarin] Recovered aborted navigation with authenticated HTTP fetch: ${link}`);
                        }
                    }
                    await page.waitForSelector('.body-nota p, .body-article p, article p, .content-nota p, .entry-content p', {
                        timeout: 10000
                    }).catch(() => null);

                    const publishedAt = await this.extractPublishedDate(page);
                    if (!this.isFromToday(publishedAt)) {
                        this.recordDateSkip(link, publishedAt);
                        continue;
                    }

                    const data = await page.evaluate(() => {
                        const title =
                            (document.querySelector('h1') as HTMLElement)?.innerText.trim() ||
                            (document.querySelector('.title') as HTMLElement)?.innerText.trim() ||
                            '';
                        const selectors = ['.body-nota', '.body-article', 'article', '.content-nota', '.entry-content', 'div[class*="body"]'];
                        const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                        let paragraphs: string[] = [];

                        for (const selector of selectors) {
                            const candidates = Array.from(document.querySelectorAll(`${selector} p`));
                            if (candidates.length <= 2) continue;
                            paragraphs = candidates
                                .filter(element => !element.closest(embedAncestor))
                                .map(element => (element as HTMLElement).innerText.trim())
                                .filter(Boolean);
                            if (paragraphs.length > 0) break;
                        }

                        const structuredPaywall = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(script => {
                            try {
                                const parsed = JSON.parse(script.textContent || 'null');
                                const pending = Array.isArray(parsed) ? [...parsed] : [parsed];
                                while (pending.length > 0) {
                                    const node = pending.shift();
                                    if (!node || typeof node !== 'object') continue;
                                    if (node.isAccessibleForFree === false || String(node.isAccessibleForFree).toLowerCase() === 'false') return true;
                                    if (Array.isArray(node['@graph'])) pending.push(...node['@graph']);
                                }
                            } catch {
                                // Ignore malformed JSON-LD and continue with visible article signals.
                            }
                            return false;
                        });
                        const articleRoot = document.querySelector('article');
                        const articleText = (articleRoot as HTMLElement | null)?.innerText || '';
                        const paywalled = structuredPaywall ||
                            Boolean(articleRoot?.querySelector('[class*="paywall"], [class*="loginwall"]')) ||
                            /solo suscriptores|suscribite para seguir leyendo|ingres[aá] para continuar/i.test(articleText);
                        const image =
                            document.querySelector('picture img')?.getAttribute('src') ||
                            document.querySelector('article img')?.getAttribute('src') ||
                            document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                        return { title, paragraphs, image, paywalled };
                    });

                    const content = this.cleanParagraphs(data.paragraphs).join('\n\n');
                    if (data.paywalled && content.length < 500) {
                        this.recordContentSkip(link, data.title, `La sesión no abrió el contenido para suscriptores; solo se extrajeron ${content.length} caracteres.`);
                        continue;
                    }

                    if (!data.title || !content) {
                        this.recordContentSkip(link, data.title, `Contenido insuficiente: ${content.length} caracteres extraídos.`);
                        continue;
                    }

                    articles.push({
                        title: data.title,
                        content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: publishedAt ?? new Date(),
                        section: sectionName
                    });
                    this.recordAccepted(
                        link,
                        data.title,
                        publishedAt,
                        content.length,
                        data.paywalled ? 'Nota para suscriptores obtenida con la sesión autenticada.' : 'Fecha y contenido válidos con sesión autenticada.'
                    );
                    console.log(`[Clarin] Success${data.paywalled ? ' (subscriber)' : ''}: ${data.title.substring(0, 30)}...`);
                } catch (error) {
                    this.recordFailure(error, link);
                    console.error(`[Clarin] Error processing authenticated article ${link}:`, this.safeError(error));
                }
            }

            console.log(`[Clarin] Authenticated scrape returned ${articles.length} articles.`);
            return articles;
        } finally {
            await browser.close();
        }
    }

    private async login(page: Page, email: string, password: string): Promise<boolean> {
        console.log('[Clarin] Opening subscriber login...');
        await page.goto('https://www.clarin.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        const alreadyLoggedIn = await page.evaluate(() =>
            !Array.from(document.querySelectorAll('button')).some(button => /ingresar/i.test((button as HTMLElement).innerText || ''))
        );
        if (alreadyLoggedIn) return true;

        const clicked = await page.evaluate(() => {
            const button = Array.from(document.querySelectorAll('button, a')).find(element =>
                /^ingresar$/i.test(((element as HTMLElement).innerText || '').trim()) ||
                /boton ingresar/i.test(element.getAttribute('aria-label') || '')
            );
            if (!button) return false;
            (button as HTMLElement).click();
            return true;
        });
        if (!clicked) return false;

        const context = await this.waitForLoginContext(page);
        if (!context) return false;

        const emailSelector = 'input[name="username"], input[type="email"], input#username, input#email';
        const passwordSelector = 'input[name="password"], input[type="password"], input#password';
        const emailInput = await context.waitForSelector(emailSelector, { visible: true, timeout: 15000 }).catch(() => null);
        if (!emailInput) return false;
        await emailInput.type(email, { delay: 20 });

        const emailSubmit = await context.$('button[type="submit"], input[type="submit"]');
        if (!emailSubmit) return false;
        await emailSubmit.click();

        const passwordInput = await context.waitForSelector(passwordSelector, { visible: true, timeout: 30000 }).catch(() => null);
        if (!passwordInput) return false;
        await passwordInput.type(password, { delay: 20 });

        const passwordSubmit = await context.$('button[type="submit"], input[type="submit"]');
        if (!passwordSubmit) return false;
        await passwordSubmit.click();

        await page.waitForFunction(() =>
            !Array.from(document.querySelectorAll('button')).some(button => /ingresar/i.test((button as HTMLElement).innerText || '')),
            { timeout: 30000 }
        ).catch(() => null);

        const passwordStillVisible = await context.$(passwordSelector)
            .then(element => Boolean(element))
            .catch(() => false);
        const loginButtonStillVisible = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button')).some(button => /ingresar/i.test((button as HTMLElement).innerText || ''))
        ).catch(() => true);

        const ok = !passwordStillVisible && !loginButtonStillVisible;
        console.log(`[Clarin] Login ${ok ? 'OK' : 'failed'}.`);
        return ok;
    }

    private async waitForLoginContext(page: Page): Promise<Page | Frame | null> {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            if (/micuenta\.clarin\.com|login|authorize/i.test(page.url())) return page;
            const frame = page.frames().find(candidate => /micuenta\.clarin\.com|login|authorize/i.test(candidate.url()));
            if (frame) return frame;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        return null;
    }

    private sectionUrl(): string {
        const parsed = new URL(this.baseUrl);
        const segment = parsed.pathname.split('/').filter(Boolean).pop() || 'lo-ultimo';
        return `https://www.clarin.com/${segment}/`;
    }

    private safeError(error: unknown): string {
        return error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    }

    // Public fallback bypasses Puppeteer to avoid Cloudflare blocks.
    private async scrapePublic(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        console.log(`[Clarin] Starting native fetch scrape for ${this.baseUrl} with limit ${limit}...`);

        const allArticles: ScrapedArticle[] = [];
        const seenUrls = new Set<string>();

        try {
            // Determine the requested section from the baseUrl path
            const urlObj = new URL(this.baseUrl);
            const pathSegments = urlObj.pathname.split('/').filter(Boolean);
            const sectionSegment = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'lo-ultimo';

            const fetchOptions = {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            };

            const addLink = (rawUrl: string): void => {
                const url = rawUrl.replace('<![CDATA[', '').replace(']]>', '').trim();
                // Exclude videos, fotogalerias and repetitive SEO "cotización" pages
                // (foreign-country dollar quotes, daily currency listings) that the
                // user flagged as irrelevant noise for an Argentine audience.
                if (url.includes('/videos/') || url.includes('/fotogalerias/')) return;
                if (this.isQuoteFiller(url)) return;
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    links.push(url);
                }
            };

            const links: string[] = [];

            // Primary source: the section's HTML landing page. Unlike the RSS feed
            // (which for /economia is dominated by auto-generated "dólar hoy en <país>"
            // and daily-quote SEO pages), the landing page lists the section's real,
            // editorially-curated articles. The social-crawler UA still bypasses the
            // Cloudflare datacenter-IP block that pushed us to RSS originally.
            let htmlOk = false;
            try {
                const sectionUrl = `https://www.clarin.com/${sectionSegment}/`;
                console.log(`[Clarin] Fetching section page: ${sectionUrl}`);
                const secRes = await fetch(sectionUrl, fetchOptions);
                if (secRes.ok) {
                    const $sec = cheerio.load(await secRes.text());
                    $sec('a').each((_, el) => {
                        let href = $sec(el).attr('href');
                        if (!href) return;
                        if (!href.startsWith('http')) href = `https://www.clarin.com${href}`;
                        // Keep only real article links within the requested section
                        const re = new RegExp(`^https://www\\.clarin\\.com/${sectionSegment}/.+\\.html`);
                        if (re.test(href)) addLink(href);
                    });
                    htmlOk = links.length > 0;
                    console.log(`[Clarin] Found ${links.length} relevant articles from section page.`);
                } else {
                    console.warn(`[Clarin] Section page returned ${secRes.status}. Falling back to RSS.`);
                }
            } catch (e) {
                console.warn(`[Clarin] Section page fetch failed, falling back to RSS:`, e);
            }

            // Fallback source: RSS feed (with a further fallback to "lo-ultimo").
            if (!htmlOk) {
                const rssSection = sectionSegment === 'ultimo-momento' ? 'lo-ultimo' : sectionSegment;
                const rssUrl = `https://www.clarin.com/rss/${rssSection}/`;
                console.log(`[Clarin] Fetching RSS feed: ${rssUrl}`);

                let response = await fetch(rssUrl, fetchOptions);
                if (!response.ok) {
                    console.warn(`[Clarin] Warning: RSS feed ${rssUrl} returned ${response.status}. Falling back to lo-ultimo.`);
                    if (rssUrl !== 'https://www.clarin.com/rss/lo-ultimo/') {
                        const fallbackRes = await fetch('https://www.clarin.com/rss/lo-ultimo/', fetchOptions);
                        if (fallbackRes.ok) {
                            Object.defineProperty(response, 'text', { value: () => fallbackRes.text() });
                            Object.defineProperty(response, 'ok', { value: true });
                        } else {
                            throw new Error(`Failed to fetch fallback RSS feed: ${fallbackRes.status}`);
                        }
                    } else {
                        throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
                    }
                }

                const xml = await response.text();
                const linkRegex = /<link>(https:\/\/www\.clarin\.com\/[^<]+\.html.*?)<\/link>/g;
                let match;
                while ((match = linkRegex.exec(xml)) !== null) {
                    addLink(match[1]);
                }
                console.log(`[Clarin] Found ${links.length} potential articles from RSS. Scraping up to ${limit}...`);
            }

            // Determine section based on current baseUrl
            let sectionName = 'Portada';
            if (urlObj.pathname && urlObj.pathname !== '/') {
                const segment = urlObj.pathname.split('/').filter(p => p).pop() || 'Portada';
                sectionName = segment.charAt(0).toUpperCase() + segment.slice(1);
            }

            this.recordCandidates(links);
            for (const link of links) {
                if (allArticles.length >= limit) break;

                try {
                    this.recordVisit(link);
                    console.log(`[Clarin] Fetching ${link}`);
                    const artRes = await fetch(link, {
                        headers: {
                            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5'
                        }
                    });

                    if (!artRes.ok) {
                        this.recordFailure(new Error(`Article request returned ${artRes.status}`), link);
                        continue;
                    }
                    const artHtml = await artRes.text();
                    const $art = cheerio.load(artHtml);

                    const publishedAt = this.parseDateCandidates([
                        $art('meta[property="article:published_time"]').attr('content'),
                        $art('meta[itemprop="datePublished"]').attr('content'),
                        $art('time[datetime]').first().attr('datetime'),
                        this.jsonLdDatePublished($art('script[type="application/ld+json"]').map((_, s) => $art(s).text()).get())
                    ]);
                    if (!this.isFromToday(publishedAt)) {
                        this.recordDateSkip(link, publishedAt);
                        console.log(`[Clarin] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                        continue;
                    }

                    const title = $art('h1').first().text().trim() ||
                        $art('.title').first().text().trim() ||
                        $art('article h1').first().text().trim();

                    let content = '';
                    const bodySelectors = ['.body-nota', '.body-article', 'article', '.content-nota', '.entry-content', 'div[class*="body"]'];
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';

                    for (const sel of bodySelectors) {
                        const pars = $art(`${sel} p`);
                        if (pars.length > 2) {
                            const pTexts: string[] = [];
                            pars.each((_, p) => {
                                if ($art(p).closest(embedAncestor).length > 0) return;
                                pTexts.push($art(p).text().trim());
                            });
                            content = this.cleanParagraphs(pTexts).join('\n\n');
                            break;
                        }
                    }

                    const image = $art('picture img').attr('src') ||
                        $art('article img').attr('src') ||
                        $art('meta[property="og:image"]').attr('content');

                    if (title && content) {
                        allArticles.push({
                            title,
                            content,
                            url: link,
                            imageUrl: image || undefined,
                            publishedAt: publishedAt ?? new Date(),
                            section: sectionName
                        });
                        this.recordAccepted(link, title, publishedAt, content.length);
                        console.log(`[Clarin] Success: ${title.substring(0, 30)}...`);
                    } else {
                        this.recordContentSkip(link, title, `Contenido insuficiente: ${content.length} caracteres extraídos.`);
                        console.log(`[Clarin-Debug] Skip: ${link}. Title?: ${!!title}, Content length: ${content.length}`);
                    }

                } catch (e) {
                    this.recordFailure(e, link);
                    console.error(`[Clarin] Error processing article ${link}:`, e);
                }
            }

            console.log(`[Clarin] Scraped total ${allArticles.length} unique articles.`);
            return allArticles;

        } catch (error) {
            this.recordFailure(error);
            console.error(`[Clarin] RSS feed scrape failed:`, error);
            throw error;
        }
    }

    // Repetitive auto-generated "cotización" SEO pages that flood Clarín's economía
    // feed and are irrelevant for an Argentine reader: the dollar's value in other
    // countries ("dólar hoy en Venezuela/Uruguay/…") and daily currency-quote pages
    // ("euro hoy", "dólar CCL/MEP/blue hoy … cotiza"). We drop these by URL slug.
    private isQuoteFiller(url: string): boolean {
        const slug = (url.split('/').pop() || '').toLowerCase();
        if (/^dolar-hoy-en-/.test(slug)) return true;              // dollar quote for another country
        if (/-hoy-.*cotiz/.test(slug)) return true;                // "<moneda> hoy … cotiza/cotización"
        return false;
    }

    // Required by BaseScraper interface, but unused here
    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        return [];
    }
}
