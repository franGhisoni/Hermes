import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';
import path from 'path';

export class LaNacionScraper extends BaseScraper {
    name = 'LaNacion';
    baseUrl = 'https://www.lanacion.com.ar';
    private loggedIn = false;

    protected getBrowserUserDataDir(): string {
        // Mount this directory as durable storage in the deployed service.
        // The default is useful locally; production should set
        // LA_NACION_SESSION_DIR to a persistent-volume path.
        return process.env.LA_NACION_SESSION_DIR?.trim()
            || path.resolve(process.cwd(), '.hermes-data', 'lanacion-session');
    }

    protected async performScrape(page: Page, url: string): Promise<ScrapedArticle[]> {
        // Keep descriptive names for deployments, while accepting the short
        // names used by the local environment.
        const email = (process.env.LA_NACION_EMAIL || process.env.LN_EMAIL || process.env.ln_email)?.trim();
        const password = process.env.LA_NACION_PASSWORD || process.env.LN_PASSWORD || process.env.ln_passowrd;

        if (email && password && !this.loggedIn) {
            try {
                this.loggedIn = await this.login(page, email, password);
                if (this.loggedIn) {
                    console.log('[LaNacion] Authenticated session active.');
                }
            } catch (loginErr) {
                console.warn('[LaNacion] Authenticated login failed; subscriber-only notes will be blocked:', loginErr instanceof Error ? loginErr.message : String(loginErr));
            }
        } else if (!email || !password) {
            console.log('[LaNacion] Subscriber credentials not set; using public extraction.');
        }

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
        this.recordCandidates(articleLinks);

        for (const link of articleLinks) {
            if (articles.length >= this.requestedLimit) break;
            if (!link) continue;
            console.log(`[LaNacion] Visiting ${link}`);
            try {
                this.recordVisit(link);
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForSelector('.c-cuerpo p, .body-nota p, article p, #cuerpo-nota p, .col-12 p', {
                    timeout: 8000
                }).catch(() => null);

                const publishedAt = await this.extractPublishedDate(page) ?? this.dateFromUrl(link);
                if (!this.isFromToday(publishedAt)) {
                    this.recordDateSkip(link, publishedAt);
                    console.log(`[LaNacion] Skipping non-today article (${publishedAt!.toISOString()}): ${link}`);
                    continue;
                }

                const data = await page.evaluate(() => {
                    const title = document.querySelector('h1')?.innerText?.trim() || '';

                    // Body selectors for La Nacion
                    const bodySelectors = [
                        '.c-cuerpo',
                        '.body-nota',
                        '#cuerpo-nota',
                        'section.cuerpo',
                        '.c-story-content',
                        '.story-content',
                        'article',
                        'section',
                        '.col-12',
                        'div[class*="cuerpo"]'
                    ];
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    let paragraphs: string[] = [];

                    for (const sel of bodySelectors) {
                        const els = document.querySelectorAll(`${sel} p`);
                        if (els.length > 2) {
                            paragraphs = Array.from(els)
                                .filter(p => !(p as HTMLElement).closest(embedAncestor))
                                .map(p => (p as HTMLElement).innerText.trim())
                                .filter(t => t.length > 0);
                            if (paragraphs.length > 0) break;
                        }
                    }

                    const image = document.querySelector('figure img')?.getAttribute('src') ||
                        document.querySelector('.c-foco img')?.getAttribute('src') ||
                        document.querySelector('meta[property="og:image"]')?.getAttribute('content');

                    let structuredBody = '';
                    let isPaywalled = false;
                    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                    for (const script of jsonLdScripts) {
                        try {
                            const json = JSON.parse(script.textContent || '');
                            if (json?.pagetype === 'nota' && json.valor && json.valor !== 'abierta') {
                                isPaywalled = true;
                            }
                            const nodes = Array.isArray(json) ? json : (json['@graph'] || [json]);
                            const article = nodes.find((node: any) => {
                                const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
                                return types.includes('NewsArticle') || types.includes('Article');
                            });
                            if (!article) continue;

                            if (typeof article.articleBody === 'string') structuredBody = article.articleBody.trim();
                            isPaywalled ||= String(article.isAccessibleForFree).toLowerCase() === 'false';
                            break;
                        } catch {
                            // Try the next JSON-LD block.
                        }
                    }

                    // La Nación can return HTTP 200 plus a rendered quota wall
                    // for a signed-in account that is not entitled to this note.
                    // That wall also contains several <p> nodes, so title/content
                    // alone is not enough to consider an extraction valid.
                    const visiblePageText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();

                    // The quota page is served with HTTP 200 and has the same
                    // article-like markup as a real note.  Do not rely on one
                    // literal: La Nación rotates copy such as "Alcancé el
                    // límite...", "Oportunidades de suscripción" and
                    // "Disfrutá de beneficios exclusivos" (the latter two are
                    // cards shown alongside the quota notice).
                    const quotaNotice = /alcanz(?:a|[ée])\s+el\s+l[ií]mite\s+de\s+art[ií]culos(?:\s+gratuitos)?|l[ií]mite\s+de\s+art[ií]culos\s+gratuitos|cantidad\s+(?:limitada|restringida)\s+de\s+art[ií]culos|n[uú]mero\s+restringido\s+de\s+art[ií]culos/i.test(visiblePageText);
                    const subscriptionOffer = /oportunidades\s+de\s+suscripci[oó]n|disfrut[aá]\s+de\s+beneficios\s+exclusivos|credencial\s+de\s+club\s+premium/i.test(visiblePageText);
                    const accessWall = quotaNotice || subscriptionOffer;

                    return { title, paragraphs, image, structuredBody, isPaywalled, accessWall };
                });

                const renderedContent = this.cleanParagraphs(data.paragraphs).join('\n\n');
                const structuredContent = this.cleanParagraphs(data.structuredBody.split(/\n+/)).join('\n\n');
                const content = structuredContent.length > renderedContent.length
                    ? structuredContent
                    : renderedContent;
                if (data.accessWall) {
                    this.recordContentSkip(
                        link,
                        data.title,
                        'La cuenta llegó al muro de acceso de La Nación; se omitió el aviso de límite gratuito y no se creó una nota.'
                    );
                    console.warn(`[LaNacion] Access wall detected, skipping: ${link}`);
                } else if (data.isPaywalled && !this.loggedIn) {
                    // JSON-LD marks this as subscriber-only. A body embedded
                    // in that JSON must never be treated as permission to
                    // republish it when the account session was not verified.
                    this.recordContentSkip(
                        link,
                        data.title,
                        'Nota exclusiva omitida: la sesión de suscriptor no pudo verificarse en La Nación.'
                    );
                    console.warn(`[LaNacion] Subscriber-only article without a verified session, skipping: ${link}`);
                } else if (data.title && content) {
                    articles.push({
                        title: data.title,
                        content,
                        url: link,
                        imageUrl: data.image || undefined,
                        publishedAt: publishedAt ?? new Date()
                    });
                    this.recordAccepted(
                        link,
                        data.title,
                        publishedAt,
                        content.length,
                        data.isPaywalled
                            ? (this.loggedIn ? 'Nota de suscriptor aceptada con sesión autenticada.' : 'Nota de suscriptor aceptada (cuerpo estructurado).')
                            : 'Fecha y contenido válidos.'
                    );
                    console.log(`[LaNacion] Success${data.isPaywalled ? ' (subscriber)' : ''}: ${data.title.substring(0, 30)}...`);
                } else {
                    this.recordContentSkip(
                        link,
                        data.title,
                        `Contenido insuficiente: título ${data.title ? 'presente' : 'ausente'}, ${content.length} caracteres extraídos.`
                    );
                }
            } catch (e) {
                this.recordFailure(e, link);
                console.error(`Error scraping ${link}`, e);
            }
        }

        return articles;
    }

    private async login(page: Page, email: string, password: string): Promise<boolean> {
        // Reuse a durable authenticated browser profile whenever it is still
        // valid. This prevents a new guest session on every scheduled run.
        if (await this.hasVerifiedAccountControl(page)) {
            console.log('[LaNacion] Reusing verified subscriber browser session.');
            return true;
        }

        console.log('[LaNacion] Opening subscriber login...');
        // Open the identity provider directly. The homepage login button is
        // hydrated asynchronously and can be missing during domcontentloaded.
        await page.goto('https://micuenta.lanacion.com.ar/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Step 1: Username / Email
        const emailSelector = 'input#username, input[name="username"], input[type="email"]';
        const emailInput = await page.waitForSelector(emailSelector, { visible: true, timeout: 30000 }).catch(() => null);
        if (!emailInput) {
            console.warn('[LaNacion] Username input not found and no verified subscriber session exists.');
            return false;
        }

        await emailInput.type(email, { delay: 20 });

        // Submit email
        const submitEmailClicked = await page.evaluate(() => {
            const btn = document.querySelector('button._button-login-id, button[type="submit"][name="action"], button[type="submit"]') as HTMLElement | null;
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (!submitEmailClicked) {
            await page.keyboard.press('Enter');
        }

        // Step 2: Password
        const passwordSelector = 'input#password, input[name="password"], input[type="password"]';
        const passwordInput = await page.waitForSelector(passwordSelector, { visible: true, timeout: 30000 }).catch(() => null);
        if (!passwordInput) {
            console.warn('[LaNacion] Password input not found on login page.');
            return false;
        }

        await passwordInput.type(password, { delay: 20 });

        // Submit password
        const submitPasswordClicked = await page.evaluate(() => {
            const btn = document.querySelector('button._button-login-password, button[type="submit"][name="action"], button[type="submit"]') as HTMLElement | null;
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (!submitPasswordClicked) {
            await page.keyboard.press('Enter');
        }

        // Auth0 first redirects to ingresar.lanacion.com.ar/auth0-callback.
        // Do not navigate away at that point: its JavaScript still has to
        // finish writing the La Nación session and redirect to the site.
        // Interrupting it here was the reason a valid password could still
        // leave the scraper browsing as a guest.
        await page.waitForFunction(() => {
            return window.location.hostname === 'www.lanacion.com.ar';
        }, { timeout: 60000 }).catch(() => null);

        const ok = await this.hasVerifiedAccountControl(page);
        console.log(`[LaNacion] Subscriber session ${ok ? 'verified and persisted' : 'not verified'}.`);
        return ok;
    }

    private async hasVerifiedAccountControl(page: Page): Promise<boolean> {
        await page.goto('https://www.lanacion.com.ar/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null);
        return page.evaluate(() => {
            const accountLink = Array.from(document.querySelectorAll('a')).find(anchor => {
                const href = (anchor as HTMLAnchorElement).href || '';
                const text = (anchor.textContent || '').trim().toLowerCase();
                return /micuenta\.lanacion\.com\.ar|\/login|\/u\/login/.test(href) || /^(ingresar|inici[aá] sesi[oó]n)$/.test(text);
            });

            // Guests are shown an "Ingresar" account link.  A verified
            // session replaces it with the authenticated account control.
            return !accountLink && window.location.hostname.endsWith('lanacion.com.ar');
        });
    }
}
