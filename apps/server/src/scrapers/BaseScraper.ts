import puppeteer, { Browser, Page } from 'puppeteer';

export interface ScrapedArticle {
    title: string;
    content: string;
    url: string;
    imageUrl?: string;
    publishedAt?: Date;
    section?: string;
}

export abstract class BaseScraper {
    abstract name: string;
    abstract baseUrl: string;
    // Specific sections to scrape in addition to the base URL
    abstract sections: string[];

    async scrape(limit: number = 5): Promise<ScrapedArticle[]> {
        console.log(`[${this.name}] Starting scrape with limit ${limit}...`);
        const browser = await puppeteer.launch({
            headless: true, // Set to false for debugging
            args: ['--no-sandbox', '--disable-setuid-sandbox']
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

            // Filter console logs: Only show warnings and errors, but ignore ERR_FAILED caused by our blocking
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();
                // Ignore blocked resource errors
                if (text.includes('ERR_FAILED') || text.includes('ERR_BLOCKED_BY_CLIENT')) return;

                if (type === 'error' || type === 'warning') {
                    console.log(`[Browser ${this.name}] ${type.toUpperCase()}:`, text);
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            // Construct list of URLs to visit: Base URL + Sections
            // Map to an object { url: string, sectionName: string }
            const targets = [
                { url: this.baseUrl, section: 'Portada' },
                ...this.sections.map(s => {
                    // Fix: Ensure we don't duplicate slashes if baseUrl ends with one and section starts with one
                    let base = this.baseUrl;
                    if (base.endsWith('/')) base = base.slice(0, -1);
                    const sectionPath = s.startsWith('/') ? s : `/${s}`;

                    const url = s.startsWith('http') ? s : `${base}${sectionPath}`;
                    // Derive section name from path (e.g. /politica -> Politica) or use a config map later
                    const name = s.split('/').filter(p => p).pop() || 'General';
                    return { url, section: name.charAt(0).toUpperCase() + name.slice(1) };
                })
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
                            // Assign section if not present
                            if (!article.section) {
                                article.section = target.section;
                            }
                            allArticles.push(article);
                            sectionCount++;
                        }
                    }
                    console.log(`[${this.name}] Added ${sectionCount} articles from ${target.section}. Total unique so far: ${allArticles.length}`);

                } catch (err) {
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
}
