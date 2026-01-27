import puppeteer, { Browser, Page } from 'puppeteer';

export interface ScrapedArticle {
    title: string;
    content: string;
    url: string;
    imageUrl?: string;
    publishedAt?: Date;
}

export abstract class BaseScraper {
    abstract name: string;
    abstract baseUrl: string;

    async scrape(): Promise<ScrapedArticle[]> {
        console.log(`[${this.name}] Starting scrape...`);
        const browser = await puppeteer.launch({
            headless: true, // Set to false for debugging
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            const articles = await this.performScrape(page);
            console.log(`[${this.name}] Scraped ${articles.length} articles.`);
            return articles;
        } catch (error) {
            console.error(`[${this.name}] Error scraping:`, error);
            throw error;
        } finally {
            await browser.close();
        }
    }

    protected abstract performScrape(page: Page): Promise<ScrapedArticle[]>;
}
