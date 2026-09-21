import { BaseScraper, ScrapedArticle } from './BaseScraper';
import { Page } from 'puppeteer';
import { isLaNacionAccessWall } from '../services/ContentSafetyService';
import { LaNacionSessionStore } from '../services/LaNacionSessionStore';

export class LaNacionScraper extends BaseScraper {
    name = 'LaNacion';
    baseUrl = 'https://www.lanacion.com.ar';
    private loggedIn = false;
    private lastLoginFailure = 'sin detalle';
    private sessionStore = new LaNacionSessionStore();
    private static pendingRun: Promise<void> = Promise.resolve();

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        // Section jobs share the same browser and must not log in or refresh
        // the account simultaneously.
        const previous = LaNacionScraper.pendingRun;
        let release!: () => void;
        LaNacionScraper.pendingRun = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
            const articles = await super.scrape(limit);
            const failure = this.getDiagnostics().lastFailure;
            if (failure?.startsWith('La Nación detenida:')) throw new Error(failure);
            return articles;
        } finally {
            release();
        }
    }

    protected getBrowserReuseKey(): string {
        // One long-lived browser owns La Nación's Auth0 cookies. Each scrape
        // opens and closes only its tab, never the authenticated browser.
        return 'lanacion-subscriber';
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
            throw new Error('La Nación detenida: faltan credenciales de suscriptor.');
        }
        if (!this.loggedIn) throw new Error(`La Nación detenida: no se pudo verificar la sesión autenticada (${this.lastLoginFailure}).`);
        let premiumAccess = await this.verifyPremiumAccess(page);
        if (!premiumAccess) {
            // A cookie can be syntactically valid but revoked. Clear it once,
            // perform a fresh login and prove the entitlement again.
            await this.resetSubscriberSession(page);
            this.loggedIn = await this.login(page, email, password);
            premiumAccess = this.loggedIn && await this.verifyPremiumAccess(page);
        }
        if (!premiumAccess) {
            throw new Error('La Nación detenida: la prueba de lectura Premium no entregó una nota exclusiva válida.');
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
                        '.story-content'
                    ];
                    const embedAncestor = '.twitter-tweet, blockquote.twitter-tweet, [class*="tweet"], [class*="x-embed"], [class*="instagram"], [class*="tiktok"], iframe';
                    let paragraphs: string[] = [];

                    paragraphs = Array.from(document.querySelectorAll('p.com-paragraph, p.ds-custom-paragraph'))
                        .filter(p => !(p as HTMLElement).closest(embedAncestor))
                        .map(p => (p as HTMLElement).innerText.trim()).filter(Boolean);

                    for (const sel of bodySelectors) {
                        if (paragraphs.length > 0) break;
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
                    let structuredHeadline = '';
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
                            if (typeof article.headline === 'string') structuredHeadline = article.headline.trim();
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
                    const visiblePageText = [title, ...paragraphs].join(' ').replace(/\s+/g, ' ').trim();

                    // The quota page is served with HTTP 200 and has the same
                    // article-like markup as a real note.  Do not rely on one
                    // literal: La Nación rotates copy such as "Alcancé el
                    // límite...", "Oportunidades de suscripción" and
                    // "Disfrutá de beneficios exclusivos" (the latter two are
                    // cards shown alongside the quota notice).
                    const quotaNotice = /alcanz(?:a|[ée])\s+el\s+l[ií]mite\s+de\s+art[ií]culos(?:\s+gratuitos)?|l[ií]mite\s+de\s+art[ií]culos\s+gratuitos|cantidad\s+(?:limitada|restringida)\s+de\s+art[ií]culos|n[uú]mero\s+restringido\s+de\s+art[ií]culos/i.test(visiblePageText);
                    const subscriptionOffer = /oportunidades\s+de\s+suscripci[oó]n|disfrut[aá]\s+de\s+beneficios\s+exclusivos|credencial\s+de\s+club\s+premium/i.test(visiblePageText);
                    const accessWall = quotaNotice || subscriptionOffer;

                    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
                    return { title, paragraphs, image, structuredBody, structuredHeadline, canonicalUrl, isPaywalled, accessWall };
                });

                const renderedContent = this.cleanParagraphs(data.paragraphs).join('\n\n');
                const structuredContent = this.cleanParagraphs(data.structuredBody.split(/\n+/)).join('\n\n');
                const content = structuredContent.length > renderedContent.length
                    ? structuredContent
                    : renderedContent;
                const identity = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (data.accessWall || isLaNacionAccessWall({ url: link, title: data.title, content })) {
                    this.recordContentSkip(
                        link,
                        data.title,
                        'La cuenta llegó al muro de acceso de La Nación; se omitió el aviso de límite gratuito y no se creó una nota.'
                    );
                    console.warn(`[LaNacion] Access wall detected, skipping: ${link}`);
                } else if (!data.structuredHeadline || identity(data.title) !== identity(data.structuredHeadline)
                    || data.canonicalUrl.replace(/\/$/, '') !== link.split(/[?#]/)[0].replace(/\/$/, '') || renderedContent.length < 200) {
                    this.recordContentSkip(link, data.title, 'Extracción rechazada: falta cuerpo periodístico o el título visible no corresponde al NewsArticle.');
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
        // Reuse the shared browser session whenever it is still
        // valid. This prevents a new guest session on every scheduled run.
        if (await this.hasVerifiedAccountControl(page)) {
            console.log('[LaNacion] Reusing verified subscriber browser session.');
            return true;
        }

        const persistedCookies = await this.sessionStore.load(password);
        if (persistedCookies?.length) {
            await page.setCookie(...persistedCookies);
            if (await this.hasVerifiedAccountControl(page)) {
                console.log('[LaNacion] Restored subscriber browser session from Redis.');
                return true;
            }
            await this.sessionStore.clear();
        }

        console.log('[LaNacion] Opening subscriber login...');
        // Open the identity provider directly. The homepage login button is
        // hydrated asynchronously and can be missing during domcontentloaded.
        // `ingresar` is the stable authentication entrypoint: it creates the
        // Auth0 transaction and redirects to login.lanacion.com.ar. `micuenta`
        // is only the account SPA and its client-side redirect does not run
        // reliably in Railway's headless browser.
        await page.goto('https://ingresar.lanacion.com.ar/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Step 1: Username / Email
        const emailSelector = 'input#username, input[name="username"], input[type="email"]';
        let emailInput = await page.waitForSelector(emailSelector, { visible: true, timeout: 15000 }).catch(() => null);
        if (!emailInput && page.url().includes('micuenta.lanacion.com.ar')) {
            const openedLogin = await page.evaluate(() => {
                const control = Array.from(document.querySelectorAll('a, button')).find(element => {
                    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                    return /^(ingresar|iniciar sesi[oó]n)$/i.test(text);
                }) as HTMLElement | undefined;
                control?.click();
                return Boolean(control);
            });
            if (openedLogin) {
                console.log('[LaNacion] Following the official login control from Mi Cuenta.');
                emailInput = await page.waitForSelector(emailSelector, { visible: true, timeout: 30000 }).catch(() => null);
            }
        }
        if (!emailInput) {
            this.lastLoginFailure = `no apareció el campo de usuario en ${new URL(page.url()).hostname}`;
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
            this.lastLoginFailure = `no apareció el campo de contraseña en ${new URL(page.url()).hostname}`;
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
            return ['www.lanacion.com.ar', 'micuenta.lanacion.com.ar'].includes(window.location.hostname);
        }, { timeout: 60000 }).catch(() => null);

        // The account application also hydrates after the redirect. Do not
        // interrupt that step until its token cookies actually exist.
        const tokenReady = await this.waitForAuthCookies(page, 30000);
        if (!tokenReady) {
            this.lastLoginFailure = `Auth0 terminó en ${new URL(page.url()).hostname} pero no entregó cookies`;
            return false;
        }
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => null);

        const ok = await this.hasVerifiedAccountControl(page);
        if (ok) await this.sessionStore.save(password, await page.cookies());
        if (!ok) this.lastLoginFailure = `las cookies no quedaron válidas al volver a ${new URL(page.url()).hostname}`;
        console.log(`[LaNacion] Subscriber session ${ok ? 'verified' : 'not verified'}.`);
        return ok;
    }

    private async hasVerifiedAccountControl(page: Page): Promise<boolean> {
        await page.goto('https://www.lanacion.com.ar/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        const cookies = await page.cookies();
        const hasAuthCookie = cookies.some(cookie => ['token', 'access-token'].includes(cookie.name)
            && cookie.value.length > 0 && (cookie.expires === -1 || cookie.expires > Date.now() / 1000));
        if (!hasAuthCookie) return false;
        // Header hydration is not an authentication source of truth: in
        // production it can keep rendering "Ingresar" even with valid
        // HttpOnly tokens. The premium reading probe verifies entitlement.
        return true;
    }

    private async waitForAuthCookies(page: Page, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const cookies = await page.cookies();
            if (cookies.some(cookie => ['token', 'access-token'].includes(cookie.name)
                && cookie.value.length > 0 && (cookie.expires === -1 || cookie.expires > Date.now() / 1000))) return true;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        console.warn(`[LaNacion] Login finished at ${page.url()} without valid authentication cookies.`);
        return false;
    }

    private async resetSubscriberSession(page: Page): Promise<void> {
        const cookies = (await page.cookies()).filter(cookie => ['token', 'access-token'].includes(cookie.name));
        if (cookies.length) await page.deleteCookie(...cookies);
        await this.sessionStore.clear();
        this.loggedIn = false;
    }

    private async verifyPremiumAccess(page: Page): Promise<boolean> {
        const probeUrl = process.env.LA_NACION_PREMIUM_CHECK_URL?.trim()
            || 'https://www.lanacion.com.ar/lifestyle/los-paises-mas-seguros-y-los-mas-inseguros-segun-el-indice-de-paz-global-2026-que-lugar-ocupa-nid10092026/';
        const parsed = new URL(probeUrl);
        if (parsed.hostname !== 'www.lanacion.com.ar' || !/-nid\d+/.test(parsed.pathname)) {
            throw new Error('LA_NACION_PREMIUM_CHECK_URL debe ser una nota real de www.lanacion.com.ar.');
        }
        await page.goto(probeUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('p.com-paragraph, p.ds-custom-paragraph', { timeout: 10000 }).catch(() => null);
        const probe = await page.evaluate(() => {
            const title = document.querySelector('h1')?.textContent?.trim() || '';
            const content = Array.from(document.querySelectorAll('p.com-paragraph, p.ds-custom-paragraph')).map(p => (p as HTMLElement).innerText.trim()).join('\n\n');
            let premium = false;
            let headline = '';
            for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
                try {
                    const json = JSON.parse(script.textContent || '');
                    const nodes = Array.isArray(json) ? json : json['@graph'] || [json];
                    for (const node of nodes) {
                        if (String(node.isAccessibleForFree).toLowerCase() === 'false') premium = true;
                        if (node.headline) headline = node.headline.trim();
                    }
                } catch { /* Ignore unrelated malformed metadata. */ }
            }
            return { title, content, premium, headline };
        });
        const ok = probe.premium && probe.title === probe.headline && probe.content.length >= 500
            && !isLaNacionAccessWall({ url: probeUrl, ...probe });
        console.log(`[LaNacion] Premium reading probe ${ok ? 'passed' : 'failed'} (${probe.content.length} rendered characters).`);
        return ok;
    }
}
