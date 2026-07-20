import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteerExtra.use(StealthPlugin());
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ScrapedArticle {
    title: string;
    content: string;
    url: string;
    imageUrl?: string;
    publishedAt?: Date;
    section?: string;
}

export interface ScrapeDiagnostics {
    candidatesDetected: number;
    candidatesVisited: number;
    accepted: number;
    skippedByDate: number;
    skippedByContent: number;
    requestFailures: number;
    lastFailure?: string;
}

export abstract class BaseScraper {
    abstract name: string;
    abstract baseUrl: string;
    private diagnostics: ScrapeDiagnostics = this.newDiagnostics();
    protected requestedLimit = Infinity;

    private newDiagnostics(): ScrapeDiagnostics {
        return {
            candidatesDetected: 0,
            candidatesVisited: 0,
            accepted: 0,
            skippedByDate: 0,
            skippedByContent: 0,
            requestFailures: 0
        };
    }

    public getDiagnostics(): ScrapeDiagnostics {
        return { ...this.diagnostics };
    }

    protected resetDiagnostics(limit: number) {
        this.diagnostics = this.newDiagnostics();
        this.requestedLimit = limit;
    }

    protected recordCandidates(count: number) { this.diagnostics.candidatesDetected = count; }
    protected recordVisit() { this.diagnostics.candidatesVisited++; }
    protected recordDateSkip() { this.diagnostics.skippedByDate++; }
    protected recordContentSkip() { this.diagnostics.skippedByContent++; }
    protected recordAccepted() { this.diagnostics.accepted++; }
    protected recordFailure(error: unknown) {
        this.diagnostics.requestFailures++;
        this.diagnostics.lastFailure = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    }

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        this.resetDiagnostics(limit);
        console.log(`[${this.name}] Starting scrape with limit ${limit}...`);
        const browser = await puppeteerExtra.launch({
            headless: true, // Set to false for debugging
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process,CrossOriginOpenerPolicy,CrossOriginEmbedderPolicy'
            ]
        });

        const allArticles: ScrapedArticle[] = [];
        const seenUrls = new Set<string>();

        try {
            const page = await browser.newPage();

            // Optimize: Block images, fonts, and ads to speed up scraping and reduce noise
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                const url = req.url();

                // Block specific resource types
                if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
                    req.abort();
                    return;
                }

                // Block Ad-related domains (simple filter)
                if (url.includes('googleads') || url.includes('doubleclick') || url.includes('analytics') || url.includes('facebook') || url.includes('twitter')) {
                    req.abort();
                    return;
                }

                req.continue();
            });

            // Filter console logs: Only show warnings and errors, but ignore noise from blocked/failed sub-resources.
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();
                // Ignore blocked resource errors (caused by our request interception above).
                if (text.includes('ERR_FAILED') || text.includes('ERR_BLOCKED_BY_CLIENT')) return;
                // Ignore HTTP errors from sub-resources (ads, trackers, images, etc.) — they don't affect article content.
                if (/Failed to load resource.*status of \d+/.test(text)) return;

                const typeStr = String(type).toLowerCase();
                if (typeStr === 'error' || typeStr === 'warning') {
                    console.log(`[Browser ${this.name}] ${type.toUpperCase()}:`, text);
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'es-AR,es-419;q=0.9,es;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Upgrade-Insecure-Requests': '1'
            });

            // Construct list of URLs to visit: just use the active baseUrl
            // Derive section name from the URL path (e.g. /politica -> Politica)
            const urlPath = new URL(this.baseUrl).pathname;
            let sectionName = 'Portada';
            if (urlPath && urlPath !== '/') {
                const segment = urlPath.split('/').filter(p => p).pop() || 'Portada';
                sectionName = segment.charAt(0).toUpperCase() + segment.slice(1);
            }
            const targets = [
                { url: this.baseUrl, section: sectionName }
            ];

            // Filter out duplicates in case baseUrl is also in sections (unlikely but safe)
            // Use unique URLs but keep section info (first win)
            const uniqueTargets: typeof targets = [];
            const seenTargets = new Set<string>();
            targets.forEach(t => {
                if (!seenTargets.has(t.url)) {
                    seenTargets.add(t.url);
                    uniqueTargets.push(t);
                }
            });

            // Fetch configured section paths to validate against
            const configuredSections = await prisma.section.findMany();
            // Create a map: path segment (lowercase) -> section name
            // e.g. 'politica' -> 'Política', 'economia' -> 'Economía'
            const validSectionMap = new Map<string, string>();
            for (const sec of configuredSections) {
                const segment = sec.path.replace(/^\//, '').toLowerCase();
                if (segment) validSectionMap.set(segment, sec.name);
            }

            for (const target of uniqueTargets) {
                // Per-section limit: Reset count for each section
                let sectionCount = 0;

                try {
                    console.log(`[${this.name}] Scraping section: ${target.section} (${target.url})`);
                    const sectionArticles = await this.performScrape(page, target.url);

                    for (const article of sectionArticles) {
                        if (sectionCount >= limit) break;

                        if (!seenUrls.has(article.url)) {
                            seenUrls.add(article.url);
                            // Derive section from the article's own URL, but only if it matches a configured section
                            if (!article.section) {
                                try {
                                    const articlePath = new URL(article.url).pathname;
                                    const firstSegment = articlePath.split('/').filter(p => p)[0]?.toLowerCase();
                                    if (firstSegment && validSectionMap.has(firstSegment)) {
                                        // Use the configured section name (with proper accents)
                                        article.section = validSectionMap.get(firstSegment)!;
                                    } else {
                                        // Not a configured section -> keep the target section
                                        article.section = target.section;
                                    }
                                } catch {
                                    article.section = target.section;
                                }
                            }
                            allArticles.push(article);
                            sectionCount++;
                        }
                    }
                    console.log(`[${this.name}] Added ${sectionCount} articles from ${target.section}. Total unique so far: ${allArticles.length}`);

                } catch (err) {
                    this.recordFailure(err);
                    console.error(`[${this.name}] Error scraping section ${target.url}:`, err);
                    // Continue to next section
                }
            }

            console.log(`[${this.name}] Scraped total ${allArticles.length} unique articles.`);
            return allArticles;
        } catch (error) {
            console.error(`[${this.name}] Error scraping:`, error);
            throw error;
        } finally {
            await browser.close();
        }
    }

    // Updated signature: pass the specific URL to scrape (homepage or section)
    protected abstract performScrape(page: Page, url: string): Promise<ScrapedArticle[]>;

    // Returns the first candidate that parses to a valid Date.
    protected parseDateCandidates(candidates: Array<string | null | undefined>): Date | null {
        for (const raw of candidates) {
            if (!raw) continue;
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return d;
        }
        return null;
    }

    // Scans JSON-LD script blocks for a `datePublished` field (NewsArticle schema).
    protected jsonLdDatePublished(scriptTexts: string[]): string | null {
        for (const text of scriptTexts) {
            try {
                const json = JSON.parse(text);
                const nodes = Array.isArray(json) ? json : (json['@graph'] || [json]);
                for (const node of nodes) {
                    if (node && typeof node.datePublished === 'string') return node.datePublished;
                }
            } catch { /* malformed JSON-LD, try next block */ }
        }
        return null;
    }

    // Extracts the real publication date from the currently loaded article page
    // (meta tags, <time datetime>, JSON-LD). Returns null if none found.
    protected async extractPublishedDate(page: Page): Promise<Date | null> {
        try {
            const result = await page.evaluate(() => {
                const meta = (sel: string) => document.querySelector(sel)?.getAttribute('content') || null;
                const candidate =
                    meta('meta[property="article:published_time"]') ||
                    meta('meta[itemprop="datePublished"]') ||
                    meta('meta[name="date"]') ||
                    meta('meta[name="DC.date.issued"]') ||
                    document.querySelector('time[datetime]')?.getAttribute('datetime') ||
                    null;
                const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                    .map(s => s.textContent || '');
                return { candidate, jsonLd };
            });
            return this.parseDateCandidates([result.candidate, this.jsonLdDatePublished(result.jsonLd)]);
        } catch {
            return null;
        }
    }

    // True if the article was published on the same calendar day the scrape is
    // running, in Argentina time. Articles with no detectable date are kept —
    // we only discard when we positively know the note is from another day.
    protected isFromToday(date: Date | null): boolean {
        if (!date) return true;
        const tz = 'America/Argentina/Buenos_Aires';
        const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz });
        return dayOf(date) === dayOf(new Date());
    }

    // Shared paragraph-level cleanup applied AFTER raw <p> extraction in every
    // scraper. Strips the kinds of noise the rewriter prompt cannot reliably
    // delete on its own: tweet captions, byline-only paragraphs at the head,
    // and Noticias Argentinas-style datelines.
    protected cleanParagraphs(rawTexts: string[]): string[] {
        const texts = rawTexts
            .map(t => (t || '').trim())
            .filter(t => t.length > 0);

        // Drop tweet/embed captions: a paragraph that's basically `@handle …`
        // or "View on X" / "Ver en Twitter" / a bare Twitter date stamp.
        const tweetLike = (t: string): boolean => {
            if (/^@[A-Za-z0-9_]{2,15}(\s|$)/.test(t)) return true;
            if (/^@[A-Za-z0-9_]{2,15}\s+·\s+/.test(t)) return true;
            if (/^(View on (X|Twitter)|Ver en (X|Twitter))/i.test(t)) return true;
            if (/^\d{1,2}:\d{2}\s+(AM|PM|a\.m\.|p\.m\.)\b/i.test(t)) return true;
            return false;
        };

        // Byline-only paragraph: a short line that's only proper-noun tokens,
        // optionally separated by /, |, or comma. We only strip these in the
        // first 3 paragraphs — bylines never live deep in the body.
        const bylineRe = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*([\s/,|]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)+\s*$/;
        const looksLikeByline = (t: string): boolean => {
            if (t.length > 80) return false;
            if (/[.!?¿¡]/.test(t)) return false;
            return bylineRe.test(t);
        };

        // NA-style dateline that's glued to the first real sentence:
        // "Buenos Aires, 19 de junio (NA). El gobierno anunció…"
        const datelineRe = /^\s*[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s.\-]*?,\s*\d{1,2}\s+de\s+\w+\s*(\((NA|Reuters|EFE|AP|AFP|Télam|Telam)\))?\s*\.?\s*[—–-]?\s*/;
        // Bare wire-service prefix: "BUENOS AIRES.-" or "(Reuters) -"
        const wirePrefixRe = /^\s*(\(?(NA|Reuters|EFE|AP|AFP|Télam|Telam|Noticias Argentinas)\)?\s*[—–-]\s*|[A-ZÁÉÍÓÚÑ]{3,}[A-ZÁÉÍÓÚÑ\s]*\.[\s\-—–]+)/;

        const cleaned: string[] = [];
        for (let i = 0; i < texts.length; i++) {
            let t = texts[i];

            if (tweetLike(t)) continue;
            if (i < 3 && looksLikeByline(t)) continue;

            if (i === 0 || (i < 2 && cleaned.length === 0)) {
                t = t.replace(datelineRe, '').replace(wirePrefixRe, '').trim();
                if (!t) continue;
            }

            cleaned.push(t);
        }

        return cleaned;
    }
}
